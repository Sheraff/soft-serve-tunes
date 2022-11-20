/// <reference lib="webworker" />
import { CACHES } from "../constants"

function trpcUrlToCacheKeys(url: URL) {
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

async function trpcUrlToCacheValues(url: URL) {
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

export default function trpcFetch(event: FetchEvent, promise: Promise<Response>, url: URL) {
	event.respondWith(
		promise
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open(CACHES.trpc).then(async (cache) => {
					const cacheKeys = trpcUrlToCacheKeys(url)
					const data = await cacheResponse.json()
					const headers = new Headers()
					const contentType = cacheResponse.headers.get('Content-Type')
					if (contentType) headers.set('Content-Type', contentType)
					const date = cacheResponse.headers.get('Date')
					if (date) headers.set('Date', date)
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