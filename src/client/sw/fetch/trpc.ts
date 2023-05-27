/// <reference lib="webworker" />
import { AllRoutesString, keyStringToArray } from "utils/trpc"
import trpcRevalidation from "../messages/trpcRevalidation"
import { CACHES } from "../utils/constants"

function trpcUrlToCacheKeys(url: URL) {
	const [, , , parts] = url.pathname.split("/")
	if (!parts) {
		throw new Error(`function called on the wrong url, no trpc endpoints found @${url}`)
	}

	const inputString = url.searchParams.get("input")
	const input = inputString
		? JSON.parse(inputString) as { [key: number]: { json: any } }
		: {}

	if (!url.searchParams.has("batch")) {
		return {
			keys: [url],
			endpoints: [parts as AllRoutesString],
			input: { "0": input } as unknown as { [key: number]: { json: any } },
		}
	}

	const endpoints = parts.split(",") as AllRoutesString[]
	const keys = endpoints.map((endpoint, i) => {
		const altUrl = new URL(`/api/trpc/${endpoint}`, url.origin)
		if (input[i]) altUrl.searchParams.set("input", JSON.stringify(input[i]))
		return altUrl
	})
	return { keys, endpoints, input }
}

type BatchItem = {
	endpoint: string
	input: string
	resolve: (response: Response) => void
}
let batchTimeout: ReturnType<typeof setTimeout> | null = null
const batchPriorityList: BatchItem[] = []

async function processBatch() {
	batchTimeout = null
	let endpoints = ''
	let input = '{'
	let i = 0
	for (; i < Math.min(batchPriorityList.length, 20); i++) {
		const item = batchPriorityList[i]!
		if (i !== 0) {
			endpoints += ','
			input += ','
		}
		endpoints += item.endpoint
		input += '"' + i + '":' + item.input
		if (input.length + endpoints.length > 2000) {
			break
		}
	}
	input += '}'
	const url = new URL(`/api/trpc/${endpoints}`, self.location.origin)
	url.searchParams.set("batch", "1")
	url.searchParams.set("input", input)
	const promise = fetch(url)
	const solved = batchPriorityList.splice(0, i)
	if (batchPriorityList.length) {
		batchTimeout = setTimeout(processBatch, 10)
	}
	const response = await promise
	if (response.status === 200 || response.status === 207) {
		handleTrpcFetchResponse(response.clone(), url)
		const json = await response.json()
		for (let i = 0; i < solved.length; i++) {
			const item = solved[i]!
			item.resolve(new Response(JSON.stringify(json[i]), {
				headers: {
					"Content-Type": "application/json"
				}
			}))
		}
	} else if (response.status > 200 && response.status < 300) {
		console.warn("SW: unexpected 2xx response status", response)
	}
}

function addToBatch(endpoint: string, input: string) {
	let resolve: (response: Response) => void
	const promise = new Promise<Response>((res) => resolve = res)
	const item = { endpoint, input, resolve: resolve! }
	batchPriorityList.push(item)
	if (!batchTimeout) {
		batchTimeout = setTimeout(processBatch, 10)
	}
	return promise
}

async function trpcUrlCacheOrBatch(url: URL): Promise<Response> {
	const cache = await caches.open(CACHES.trpc)
	const cachedResponse = await cache.match(url)

	if (cachedResponse) {
		setTimeout(() => {
			const endpoint = url.pathname.split("/")[3]! as AllRoutesString
			const input = url.searchParams.get("input")!
			const params = JSON.parse(input).json
			trpcRevalidation({ key: keyStringToArray(endpoint), params })
		}, 1_000)
		return cachedResponse
	}

	const endpoint = url.pathname.split("/")[3]!
	const input = url.searchParams.get("input")!
	return addToBatch(endpoint, input)
}

function logTrpcError(error: {
	message: string,
	code: number,
	data: {
		code: string,
		httpStatus: number,
		stack: string,
		path: string,
	}
}) {
	console.error(`${error.data.code} ${error.data.httpStatus} @ ${error.data.path} ${error.code}\n${error.data.stack}`)
}

export async function handleTrpcFetchResponse(response: Response, url: URL) {
	const cache = await caches.open(CACHES.trpc)
	const { keys } = trpcUrlToCacheKeys(url)
	const json = await response.json()
	const data = url.searchParams.has("batch")
		? json
		: [json]
	const headers = new Headers()
	const contentType = response.headers.get("Content-Type")
	if (contentType) headers.set("Content-Type", contentType)
	const date = response.headers.get("Date")
	if (date) headers.set("Date", date)
	await Promise.all(keys.map((key, i) => {
		if ("result" in data[i]) {
			return cache.put(key, new Response(JSON.stringify(data[i]), { headers }))
		} else if ("error" in data[i]) {
			try { logTrpcError(data[i].error.json) } catch { }
		} else {
			console.error("SW: unknown trpc response format", data[i])
		}
	}))
	return json
}

function fetchFromServer(request: Request, url: URL) {
	return fetch(request)
		.then(response => {
			if (response.status === 200 || response.status === 207) {
				handleTrpcFetchResponse(response.clone(), url)
			} else if (response.status > 200 && response.status < 300) {
				console.warn("SW: unexpected 2xx response status", response)
			}
			return response
		})
}

export default function trpcFetch(event: FetchEvent, request: Request, url: URL) {
	event.respondWith(
		trpcUrlCacheOrBatch(url)
			.catch(() => fetchFromServer(request, url))
	)
}