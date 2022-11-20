/// <reference lib="webworker" />
// @ts-check

const sw = /** @type {ServiceWorkerGlobalScope} */(/** @type {unknown} */(self))

const CACHE_NAME = "soft-serve-tunes"

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
		.then((cache) => cache.add('/'))
		.then(() => sw.skipWaiting())
	)
	console.log('Hello from the Service Worker 🤙')
})

const STATIC_OFFLINE_PAGE = `
<body>
	<p>This content is served while you are offline
	<p><button onclick="window.location.reload()">reload page</button>
</body>
`

/**
 * @param {URL} url 
 */
function trpcUrlToCacheKeys(url) {
	const [,,,parts] = url.pathname.split('/')
	const endpoints = parts.split(',')
	const input = url.searchParams.has('input')
		? JSON.parse(url.searchParams.get('input'))
		: {}
	const cacheKeys = endpoints.map((endpoint, i) => {
		const altUrl = new URL(`/api/trpc/${endpoint}`, url.origin)
		if (input[i]) altUrl.searchParams.set('input', JSON.stringify(input[i]))
		return altUrl
	})
	return cacheKeys
}

/**
 * @param {URL} url 
 */
async function trpcUrlToCacheValues(url) {
	const cache = await caches.open(CACHE_NAME)
	const cacheKeys = trpcUrlToCacheKeys(url)
	const body = await Promise.all(cacheKeys.map(async (key) => {
		const response = await cache.match(key)
		if (response)
			return response.text()
		else
			return 'null'
	}))
	return new Response(`[${body.join(',')}]`, {
		headers: {
			'Content-Type': 'application/json'
		}
	})
}

/**
 * @param {FetchEvent} event 
 * @param {Promise<Response>} promise 
 * @param {URL} url 
 */
function trpcFetch(event, promise, url) {
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open(CACHE_NAME).then(async (cache) => {
					const cacheKeys = trpcUrlToCacheKeys(url)
					const data = await cacheResponse.json()
					const headers = {}
					const contentType = cacheResponse.headers.get('Content-Type')
					if (contentType) headers['Content-Type'] = contentType
					const date = cacheResponse.headers.get('Date')
					if (date) headers['Date'] = date
					cacheKeys.forEach((key, i) => {
						cache.put(key, new Response(JSON.stringify(data[i]), { headers }))
					})
				})
			}
			return response
		})
		.catch(async () => {
			return trpcUrlToCacheValues(url)
		})
	)
}

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
		const cache = await caches.open(CACHE_NAME)
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
function audioFetch(event, promise) {
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
						const parsed = range.match(/^bytes ([0-9]+)-([0-9]+)\/([0-9]+)/)
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
				cacheName: CACHE_NAME,
			})
			if (!response) {
				console.warn('SW: media file not found in cache', event.request.url)
				return new Response('', {status: 503})
			}
			const range = event.request.headers.get('Range')
			if (!range) {
				return response
			}
			const parsed = range.match(/^bytes\=(\d+)\-$/)
			if (!parsed) {
				console.warn('SW: malformed request')
				return new Response('', {status: 400})
			}
			const bytePointer = Number(parsed[1])
			if (bytePointer === 0) {
				return response
			}
			const buffer = await response.arrayBuffer()
			const end = Math.min(bytePointer + 524288, buffer.byteLength)
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

/**
 * @param {FetchEvent} event 
 * @param {Promise<Response>} promise 
 */
function defaultFetch(event, promise) {
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open(CACHE_NAME).then(cache => {
					cache.put(event.request.url, cacheResponse)
				})
			}
			return response
		})
		.catch(async () => {
			const matchedResponse = await caches.match(event.request.url, {cacheName: CACHE_NAME})
			if (matchedResponse) return matchedResponse
			console.error('SW: no matched response', event.request.url)
			return new Response(STATIC_OFFLINE_PAGE, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			})
		})
	)
}

/** @param {FetchEvent} event */
function onFetch(event) {
	/** @type {Request} */
	const request = event.request
	if (request.method !== "GET") { // ignore POST requests
		return
	}
	const url = new URL(request.url)
	if (request.headers.get('Accept')?.includes('image') && url.pathname !== '/') { // ignore requests for images
		return
	} else if (url.pathname.startsWith('/api/auth')) { // ignore requests related to auth
		return
	}
	
	const promise = fetch(request)
	if (url.pathname.startsWith('/api/trpc')) {
		trpcFetch(event, promise, url)
	} else if (url.pathname.startsWith('/api/file')) {
		audioFetch(event, promise)
	} else {
		defaultFetch(event, promise)
	}
}

sw.addEventListener('fetch', onFetch)

/**
 * @param {{id: string}} payload
 * @param {ExtendableMessageEvent} event
 */
async function messageCheckTrackCache({id}, {source}) {
	const cache = await caches.match(new URL(`/api/file/${id}`, sw.location.origin), {
		ignoreVary: true,
		ignoreSearch: true,
		cacheName: CACHE_NAME,
	})
	source.postMessage({type: 'sw-cached-track', payload: {
		id,
		cached: Boolean(cache),
	}})
}

sw.addEventListener("message", (event) => {
	switch (event.data.type) {
		case 'sw-cached-track':
			return messageCheckTrackCache(event.data.payload, event)
		default:
			console.error(new Error(`SW: unknown message type: ${event.data.type}`))
	}
})