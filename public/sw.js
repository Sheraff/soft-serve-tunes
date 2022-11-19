// @ts-check

const CACHE_NAME = "soft-serve-tunes"

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
		.then((cache) => cache.add('/'))
		.then(() => self.skipWaiting())
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
 * @param {Event} event 
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
					cacheKeys.forEach((key, i) => {
						cache.put(key, new Response(JSON.stringify(data[i]), {
							headers: {
								'Content-Type': cacheResponse.headers.get('Content-Type'),
								'Date': cacheResponse.headers.get('Date'),
							}
						}))
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
 * @param {Event} event 
 * @param {Promise<Response>} promise 
 */
function defaultFetch(event, promise) {
	/** @type {Request} */
	const request = event.request
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open(CACHE_NAME).then(cache => {
					cache.put(request.url, cacheResponse)
				})
			}
			return response
		})
		.catch(async () => {
			// console.error(error)
			const matchedResponse = await caches.match(request.url)
			if (matchedResponse) return matchedResponse
			console.error('no matched response', request.url)
			return new Response(STATIC_OFFLINE_PAGE, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			})
		})
	)
}

/** @param {Event} event */
function onFetch(event) {
	/** @type {Request} */
	const request = event.request
	if (request.method !== "GET") { // ignore POST requests
		return
	}
	const promise = fetch(request)
	const url = new URL(request.url)
	if (request.headers.get('Accept')?.includes('image') && url.pathname !== '/') { // ignore requests for images
		console.log('SW: ignore request because "image"', request.url)
		return
	} else if (url.pathname.startsWith('/api/trpc')) {
		trpcFetch(event, promise, url)
	} else if (url.pathname.startsWith('/api/auth')) {
		console.log('SW: ignore request because "auth"', request.url)
		return
	} else if (url.pathname.startsWith('/api/file')) {
		// TODO: is there a way to store music files in cache? (& handling 206)
		console.log('SW: ignore request because "media"', request.url)
		return
	} else {
		defaultFetch(event, promise)
	}
}

self.addEventListener('fetch', onFetch)