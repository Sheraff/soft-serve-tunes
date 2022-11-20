/// <reference lib="webworker" />
// @ts-check

import mediaFetch from "./fetch/media"

const sw = /** @type {ServiceWorkerGlobalScope} */(/** @type {unknown} */(self))

const VERSION = 1
const CACHES = {
	next: `Next.js - v${VERSION}`,
	trpc: `tRPC - v${VERSION}`,
	media: `Media - v${VERSION}`,
}

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHES.next)
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
	const cache = await caches.open(CACHES.trpc)
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
				caches.open(CACHES.trpc).then(async (cache) => {
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
 * @param {FetchEvent} event 
 * @param {Promise<Response>} promise 
 */
function defaultFetch(event, promise) {
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open(CACHES.next).then(cache => {
					cache.put(event.request.url, cacheResponse)
				})
			}
			return response
		})
		.catch(async () => {
			const matchedResponse = await caches.match(event.request.url, {cacheName: CACHES.next})
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
		mediaFetch(event, promise)
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
		cacheName: CACHES.media,
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