/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

function trpcUrlToCacheKeys(url: URL) {
	const [,,,parts] = url.pathname.split('/')
	if (!parts) {
		throw new Error ('function called on the wrong url, no trpc endpoints found')
	}
	const endpoints = parts.split(',')
	const inputString = url.searchParams.get('input')
	const input = inputString
		? JSON.parse(inputString) as {[key: number]: any}
		: {}
	const keys = endpoints.map((endpoint, i) => {
		const altUrl = new URL(`/api/trpc/${endpoint}`, url.origin)
		if (input[i]) altUrl.searchParams.set('input', JSON.stringify(input[i]))
		return altUrl
	})
	return {keys, endpoints, input}
}

type TextResponseLike = {
	text(): string
}

async function formatBatchResponses(
	matches: Array<Promise<Response | undefined> | Response | undefined | TextResponseLike>,
	endpoints: string[]
): Promise<Response> {
	const body = await Promise.all(matches.map(async (match, i) => {
		const response = await match
		if (response)
			return response.text()
		else
			return JSON.stringify({
				"id": null,
				"error": {
					"json": {
						"message": `This is a fake TRPCError`,
						"code": -32600,
						"data": {
							"code": "BAD_REQUEST",
							"httpStatus": 400,
							"stack": `TRPCError: []`,
							"path": endpoints[i]
						}
					}
				}
			})
	}))
	return new Response(`[${body.join(',')}]`, {
		headers: {
			'Content-Type': 'application/json'
		}
	})
}

async function trpcUrlToCacheValues(request: Request, url: URL, allowNetwork = false): Promise<Response> {
	const cache = await caches.open(CACHES.trpc)
	const {keys, endpoints, input} = trpcUrlToCacheKeys(url)
	if (!allowNetwork) {
		const matches = keys.map(key => cache.match(key))
		return formatBatchResponses(matches, endpoints)
	}

	const cacheResponses: Array<Response | undefined | TextResponseLike> = await Promise.all(keys.map(key => cache.match(key)))
	const fetchIndices = cacheResponses.reduce((array, response, i) => {
		if (!response)
			array.push(i)
		return array
	}, [] as number[])
	if (fetchIndices.length) {
		// some of the endpoints requested were missing from cache, make a single batched call to fetch them
		const fetchEndpoints = fetchIndices.map((i) => endpoints[i]).join(',')
		const fetchInput = fetchIndices.reduce((object, i, j) => {
			object[j] = input[i]
			return object
		}, {} as {[key: number]: any})
		const fetchUrl = new URL(`/api/trpc/${fetchEndpoints}`, self.location.origin)
		fetchUrl.searchParams.set('batch', '1')
		fetchUrl.searchParams.set('input', JSON.stringify(fetchInput))
		const fetchResponse = await fetch(fetchUrl)
		if (fetchResponse.status === 200 || fetchResponse.status === 207) {
			handleTrpcFetchResponse(fetchResponse.clone(), fetchUrl)
			const fetchData = await fetchResponse.json()
			fetchIndices.forEach((i, j) => cacheResponses[i] = {text: () => JSON.stringify(fetchData[j])})
		} else if (fetchResponse.status > 200 && fetchResponse.status < 300) {
			console.warn('SW: unexpected 2xx response status', fetchResponse)
		}
		Promise.resolve().then(async () => {
			// fetch from server to refresh SW cache, some requested endpoints were missing from cache so they've already been fetched
			const rest = endpoints.reduce((acc, endpoint, i) => {
				if (fetchIndices.includes(i)) return acc
				acc.endpoints.push(endpoint)
				acc.input[acc.endpoints.length - 1] = input[i]
				return acc
			}, {
				endpoints: [],
				input: {},
			} as {
				endpoints: string[],
				input: {[key: number]: any}
			})
			const restUrl = new URL(`/api/trpc/${rest.endpoints.join(',')}`, self.location.origin)
			restUrl.searchParams.set('batch', '1')
			restUrl.searchParams.set('input', JSON.stringify(rest.input))
			const restResponse = await fetch(restUrl)
			if (restResponse.status === 200 || restResponse.status === 207) {
				handleTrpcFetchResponse(restResponse, restUrl)
			} else if (restResponse.status > 200 && restResponse.status < 300) {
				console.warn('SW: unexpected 2xx response status', restResponse)
			}
		})
	} else {
		// fetch from server to refresh SW cache, no requested endpoint was missing from cache so request them all
		fetchFromServer(request, url)
	}
	return formatBatchResponses(cacheResponses, endpoints)
}

export function handleTrpcFetchResponse(response: Response, url: URL) {
	return caches.open(CACHES.trpc).then(async (cache) => {
		const {keys} = trpcUrlToCacheKeys(url)
		const data = await response.json()
		const headers = new Headers()
		const contentType = response.headers.get('Content-Type')
		if (contentType) headers.set('Content-Type', contentType)
		const date = response.headers.get('Date')
		if (date) headers.set('Date', date)
		return Promise.all(keys.map((key, i) => {
			if ('result' in data[i]) {
				return cache.put(key, new Response(JSON.stringify(data[i]), { headers }))
			} else if ('error' in data[i]) {
				console.error(new Error(data[i].error.json.message))
			} else {
				console.error('SW: unknown trpc response format', data[i])
			}
		}))
	})
}

function fetchFromServer(request: Request, url: URL) {
	return fetch(request)
	.then(response => {
		if (response.status === 200 || response.status === 207) {
			const cacheResponse = response.clone()
			handleTrpcFetchResponse(cacheResponse, url)
		} else if (response.status > 200 && response.status < 300) {
			console.warn('SW: unexpected 2xx response status', response)
		}
		return response
	})
}

export default function trpcFetch(event: FetchEvent, request: Request, url: URL) {
	event.respondWith(
		trpcUrlToCacheValues(request, url, true)
		.catch(() => fetchFromServer(request, url))
	)
}