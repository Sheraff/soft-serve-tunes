/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

type BatchItem = {
	endpoint: string
	input: string
	resolvers: Array<(body: string) => void>
}
let batchTimeout: ReturnType<typeof setTimeout> | null = null

const batchPriorityList: BatchItem[] = []
const batchLazyList: BatchItem[] = []

export function addToBatch(endpoint: string, input: string, lazy?: boolean) {
	let resolve: (response: string) => void
	const promise = new Promise<string>((res) => resolve = res)
	let duplicate = batchPriorityList.find((item) => item.endpoint === endpoint && item.input === input)
	if (duplicate) {
		duplicate.resolvers.push(resolve!)
		return promise
	}
	duplicate = batchLazyList.find((item) => item.endpoint === endpoint && item.input === input)
	if (duplicate) {
		duplicate.resolvers.push(resolve!)
		return promise
	}
	const item = { endpoint, input, resolvers: [resolve!] }
	const list = lazy ? batchLazyList : batchPriorityList
	list.push(item)
	if (!batchTimeout) {
		batchTimeout = setTimeout(processBatch, 10)
	}
	return promise
}


async function processBatch() {
	batchTimeout = null
	let endpoints = ''
	let input = '{'
	const items: BatchItem[] = []
	let maxed = false
	const maxItems = 20
	const priorityCount = Math.min(batchPriorityList.length, maxItems)
	for (let i = 0; i < priorityCount; i++) {
		const item = batchPriorityList.pop()!
		items.push(item)
		if (i !== 0) {
			endpoints += ','
			input += ','
		}
		endpoints += item.endpoint
		input += '"' + i + '":' + item.input
		maxed = input.length + endpoints.length > 2000
		if (maxed) {
			break
		}
	}
	if (!maxed && priorityCount < 20) {
		const lazyCount = Math.min(batchLazyList.length, maxItems - priorityCount)
		for (let i = 0; i < lazyCount; i++) {
			const item = batchLazyList.pop()!
			items.push(item)
			if (i !== 0) {
				endpoints += ','
				input += ','
			}
			endpoints += item.endpoint
			input += '"' + i + '":' + item.input
			maxed = input.length + endpoints.length > 2000
			if (maxed) {
				break
			}
		}
	}
	input += '}'
	const url = new URL(`/api/trpc/${endpoints}`, self.location.origin)
	url.searchParams.set("batch", "1")
	url.searchParams.set("input", input)
	const promise = fetch(url, {
		headers: {
			'Trpc-Batch-Mode': 'stream',
		}
	})
	if (batchPriorityList.length || batchLazyList.length) {
		batchTimeout = setTimeout(processBatch, 0)
	}
	const response = await promise
	if (response.status === 200 || response.status === 207) {
		const iterator = streamToLines(response.body!)
		for await (const line of iterator) {
			if (!line || line === '}') {
				continue
			}
			const indexOfColon = line.indexOf(':')
			const indexAsStr = line.substring(2, indexOfColon - 1)
			const text = line.substring(indexOfColon + 1)
			const item = items[indexAsStr as unknown as number]
			if (!item) {
				console.error("SW: unexpected trpc response index", indexAsStr)
				console.log("SW: response body", text)
				continue
			}
			item.resolvers.forEach(resolve => resolve(text))
			handleTrpcFetchResponse(
				text,
				item,
				url.origin,
				response.headers
			)
		}
	} else if (response.status > 200 && response.status < 300) {
		console.warn("SW: unexpected 2xx response status", response)
	}
}

async function handleTrpcFetchResponse(body: string, item: BatchItem, origin: string, headers: Headers) {
	if (body.startsWith(`{"result":`)) {
		const cache = await caches.open(CACHES.trpc)

		const altUrl = new URL(`/api/trpc/${item.endpoint}`, origin)
		if (item.input) altUrl.searchParams.set("input", item.input)

		const headers = new Headers()
		const contentType = headers.get("Content-Type")
		if (contentType) headers.set("Content-Type", contentType)
		const date = headers.get("Date")
		if (date) headers.set("Date", date)

		cache.put(altUrl, new Response(body, { headers }))
	} else if (body.startsWith(`{"error":`)) {
		try {
			const data = JSON.parse(body)
			if (data?.error?.json?.data?.httpStatus === 404) {
				const cache = await caches.open(CACHES.trpc)
				const altUrl = new URL(`/api/trpc/${item.endpoint}`, origin)
				if (item.input) altUrl.searchParams.set("input", item.input)
				cache.delete(altUrl)
			}
			logTrpcError(data.error.json)
		} catch { }
	} else {
		console.error("SW: unknown trpc response format", body)
	}
}

async function* streamToLines(stream: ReadableStream<Uint8Array>) {
	const decoder = new TextDecoder()
	const reader = stream.getReader()
	let buffer = ''
	let readResult = await reader.read()
	while (!readResult.done) {
		buffer += decoder.decode(readResult.value)
		const lines = buffer.split("\n")
		if (lines.length > 1) {
			for (let i = 0; i < lines.length - 1; i++) {
				yield lines[i]
			}
			buffer = lines[lines.length - 1]!
		}
		readResult = await reader.read()
	}
	if (buffer) {
		yield buffer
	}
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