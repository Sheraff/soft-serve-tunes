
/** 
 * @type {{
 *   ranges: {
 *     [start: number]: {
 *        end: number
 *        buffer: ArrayBuffer
 *        total: number
 *     } | undefined
 *   }
 *   type: string
 *   url: string
 * }}
 */
const currentMediaStream = {
	ranges: {},
	type: '',
	url: '',
}

function resolveCurrentMediaStream() {
	const {ranges, url, type} = currentMediaStream
	if (!url) return
	setTimeout(async () => {
		if (!ranges[0]) return
		const length = ranges[0].total
		// check ranges integrity
		const dataArray = new Uint8Array(length)
		const possibleStarts = Array.from(Object.keys(ranges)).map(Number).sort((a, b) => a - b)
		let bytePointer = 0
		do {
			if (typeof possibleStarts[0] === 'undefined' || possibleStarts[0] > bytePointer) {
				console.warn('SW: non-continuous range data', url, bytePointer, possibleStarts)
				return
			}
			bytePointer = possibleStarts[0]
			const current = ranges[bytePointer]
			if (!current) {
				console.warn('SW: internal error during cache creation', url, bytePointer, ranges)
				return
			}
			possibleStarts.shift()
			const dataChunk = new Uint8Array(current.buffer)
			dataArray.set(dataChunk, bytePointer)
			bytePointer = current.end + 1
		} while (bytePointer < length)
		ranges[0] = undefined
		// store as a single buffer
		const cache = await caches.open(CACHES.media)
		const buffer = dataArray.buffer
		await cache.put(url, new Response(buffer, {
			status: 200,
			headers: {
				'Content-Length': String(length),
				'Content-Type': type,
				'Cache-Control': 'public, max-age=31536000',
				'Date': (new Date()).toUTCString(),
			},
		}))
	}, 1_000)
}

/**
 * @param {FetchEvent} event 
 * @param {Promise<Response>} promise 
 */
export default function mediaFetch(event, promise) {
	if (event.request.url !== currentMediaStream.url) {
		resolveCurrentMediaStream()
		currentMediaStream.ranges = {}
		currentMediaStream.type = ''
		currentMediaStream.url = event.request.url
	}
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 206) {
				response.clone()
					.arrayBuffer()
					.then((buffer) => {
						if (!buffer.byteLength) return
						const range = response.headers.get('Content-Range')
						const contentType = response.headers.get('Content-Type')
						if (!range) return console.warn('SW: abort caching range', event.request.url)
						const parsed = range.match(/^bytes (\d+)-(\d+)\/(\d+)/)
						if (!parsed) return console.warn('SW: malformed 206 headers', event.request.url)
						const [, _start, _end, _total] = parsed
						const start = Number(_start)
						const end = Number(_end)
						const total = Number(_total)
						currentMediaStream.ranges[start] = {
							end,
							total,
							buffer,
						}
						if (contentType)
							currentMediaStream.type = contentType
						if (end + 1 === total)
							resolveCurrentMediaStream()
					})
			}
			return response
		})
		.catch(async () => {
			const response = await caches.match(event.request.url, {
				ignoreVary: true,
				ignoreSearch: true,
				cacheName: CACHES.media,
			})
			if (!response) {
				console.warn('SW: media file not found in cache', event.request.url)
				return new Response('', {status: 503})
			}
			const range = event.request.headers.get('Range')
			if (!range) {
				return response
			}
			const parsed = range.match(/^bytes\=(\d+)-(\d*)/)
			if (!parsed) {
				console.warn('SW: malformed request')
				return new Response('', {status: 400})
			}
			const bytePointer = Number(parsed[1])
			if (bytePointer === 0) {
				return response
			}
			const buffer = await response.arrayBuffer()
			const requestedEnd = parsed[2] ? Number(parsed[2]) : (bytePointer + 524288)
			const end = Math.min(requestedEnd, buffer.byteLength)
			const partial = buffer.slice(bytePointer, end)
			const result = new Response(partial, {
				status: 206,
				statusText: 'Partial Content',
				headers: {
					'Content-Type': response.headers.get('Content-Type') || 'audio/*',
					'Content-Range': `bytes ${bytePointer}-${bytePointer + partial.byteLength - 1}/${buffer.byteLength}`,
					'Content-Length': `${partial.byteLength}`,
					'Connection': 'keep-alive',
					'Keep-Alive': 'timeout=5',
					'Cache-Control': 'public, max-age=31536000',
					'Date': (new Date()).toUTCString(),
				}
			})
			return result
		})
	)
}