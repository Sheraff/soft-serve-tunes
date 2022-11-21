/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

const STATIC_OFFLINE_PAGE = `
<body>
	<p>This content is served while you are offline
	<p><button onclick="window.location.reload()">reload page</button>
</body>
`

let timeoutId: ReturnType<typeof setTimeout> | null = null

async function clearOldCacheFiles() {
	const cache = await caches.open(CACHES.next)
	const keys = await cache.keys()
	for (const key of keys) {
		const response = await fetch(key, { method: 'HEAD' })
		if (response.status >= 400 || response.status < 500) {
			cache.delete(key)
		}
	}
}

export default function defaultFetch(event: FetchEvent, request: Request) {
	event.respondWith(
		fetch(request)
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
	if (!timeoutId) {
		timeoutId = setTimeout(() => {
			timeoutId = null
			clearOldCacheFiles()
		}, 10_000)
	}
}