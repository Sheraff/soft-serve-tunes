/// <reference lib="webworker" />
import { type AllRoutes, type AllInputs, type RouterInputs, keyArrayToString } from "utils/trpc"
import { workerSocketClient } from "utils/typedWs/vanilla-client"
import { handleTrpcFetchResponse } from "../fetch/trpc"
import { deserialize } from "superjson"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

const batch: {
	items: {
		payload: {
			key: AllRoutes,
			params?: AllInputs,
		},
		invalidate: boolean,
	}[]
	timeoutId: ReturnType<typeof setTimeout> | null
} = {
	items: [],
	timeoutId: null,
}

function processBatch () {
	const items = batch.items
	batch.timeoutId = null
	batch.items = []

	if (items.length === 0) return
	if (items.length > 10) {
		const later = items.splice(10)
		later.forEach(item => addItemToBatch(item))
	}

	const { endpoints, input } = items.reduce((params, item, i) => {
		params.endpoints.push(keyArrayToString(item.payload.key))
		params.input[i] = item.payload.params
			? { json: item.payload.params }
			: { json: null, meta: { values: ["undefined"] } }
		return params
	}, { endpoints: [], input: {} } as { endpoints: ReturnType<typeof keyArrayToString>[], input: Record<number, unknown> })

	const url = new URL(`/api/trpc/${endpoints.join(",")}`, self.location.origin)
	url.searchParams.set("batch", "1")
	url.searchParams.set("input", JSON.stringify(input))

	fetch(url).then(async response => {
		if (response.status === 200 || response.status === 207) {
			const data = await handleTrpcFetchResponse(response, url)
			const clients = await self.clients.matchAll()
			clients.forEach(client => {
				items.forEach(({ invalidate, payload }, i) => {
					if (data[i].result?.data) {
						const item_data = deserialize(data[i].result.data)
						client.postMessage({ type: "sw-trpc-invalidation", payload, data: item_data })
					} else if (invalidate) {
						client.postMessage({ type: "sw-trpc-invalidation", payload })
					}
				})
			})
		} else {
			console.warn("SW: failed trpc revalidation", response.status, response.statusText, url)
		}
	}).catch((e) => {
		console.warn(new Error(`SW: caught fetch during processBatch ${url}`, { cause: e }))
		items.forEach(item => addItemToBatch(item))
	})
}

function isEquivalentItem<
	ARouteKey extends AllRoutes,
	BRouteKey extends AllRoutes,
> (
	a: { key: ARouteKey, params?: RouterInputs[ARouteKey[0]][ARouteKey[1]] },
	b: { key: BRouteKey, params?: RouterInputs[BRouteKey[0]][BRouteKey[1]] }
) {
	if (a.key[0] !== b.key[0]) return false
	if (a.key[1] !== b.key[1]) return false
	return deepEqualParams(a.params, b.params)
}

function deepEqualParams (
	a: unknown,
	b: unknown
) {
	if (a === b) return true
	if (a === undefined || b === undefined) return false
	if (a === null || b === null) return false
	if (typeof a !== "object" || typeof b !== "object") return false
	const aKeys = Object.keys(a)
	const bKeys = Object.keys(b)
	if (aKeys.length !== bKeys.length) return false
	for (let i = 0; i < aKeys.length; i++) {
		const key = aKeys[i]!
		if (!deepEqualParams((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
	}
	return true
}

function addItemToBatch<
	TRouteKey extends AllRoutes
> (
	item: {
		payload: { key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]] }
		invalidate: boolean,
	},
) {
	const existing = batch.items.find(i => isEquivalentItem(i.payload, item.payload))
	if (!existing) {
		batch.items.push(item)
	} else if (item.invalidate) {
		existing.invalidate = true
	}
}

export default function trpcRevalidation<
	TRouteKey extends AllRoutes
> (
	payload: { key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]] },
	invalidate = true,
) {
	addItemToBatch({ payload, invalidate })
	if (batch.timeoutId) {
		clearTimeout(batch.timeoutId)
	}
	batch.timeoutId = setTimeout(processBatch, 10)
}

workerSocketClient.add.subscribe({
	onData ({ type, id }) {
		console.log(`added ${type} ${id}`)
		if (type === "playlist") {
			trpcRevalidation({ key: ["playlist", "searchable"] })
			return
		}
		trpcRevalidation({ key: ["track", "searchable"] })
		trpcRevalidation({ key: ["artist", "searchable"] })
		trpcRevalidation({ key: ["album", "searchable"] })
		trpcRevalidation({ key: ["genre", "searchable"] })
		if (type === "artist") {
			trpcRevalidation({ key: ["artist", "miniature"], params: { id } })
			trpcRevalidation({ key: ["artist", "get"], params: { id } })
		} else if (type === "album") {
			trpcRevalidation({ key: ["album", "miniature"], params: { id } })
			trpcRevalidation({ key: ["album", "get"], params: { id } })
			trpcRevalidation({ key: ["album", "mostRecentAdd"] })
		}
	}
})

workerSocketClient.remove.subscribe({
	onData ({ type, id }) {
		console.log(`removed ${type} ${id}`)
		if (type === "playlist") {
			trpcRevalidation({ key: ["playlist", "searchable"] })
			trpcRevalidation({ key: ["playlist", "get"], params: { id } })
		} else if (type === "track") {
			trpcRevalidation({ key: ["track", "searchable"] })
			trpcRevalidation({ key: ["track", "miniature"], params: { id } })
		} else if (type === "artist") {
			trpcRevalidation({ key: ["artist", "searchable"] })
			trpcRevalidation({ key: ["artist", "miniature"], params: { id } })
			trpcRevalidation({ key: ["artist", "get"], params: { id } })
		} else if (type === "album") {
			trpcRevalidation({ key: ["album", "searchable"] })
			trpcRevalidation({ key: ["album", "miniature"], params: { id } })
			trpcRevalidation({ key: ["album", "get"], params: { id } })
		} else if (type === "genre") {
			trpcRevalidation({ key: ["genre", "searchable"] })
			trpcRevalidation({ key: ["genre", "miniature"], params: { id } })
			trpcRevalidation({ key: ["genre", "get"], params: { id } })
		}
	}
})

workerSocketClient.invalidate.subscribe({
	onData ({ type, id }) {
		console.log(`invalidated ${type} ${id}`)
		if (type === "track") {
			trpcRevalidation({ key: ["track", "miniature"], params: { id } })
		} else if (type === "album") {
			trpcRevalidation({ key: ["album", "miniature"], params: { id } })
			trpcRevalidation({ key: ["album", "get"], params: { id } })
		} else if (type === "artist") {
			trpcRevalidation({ key: ["artist", "miniature"], params: { id } })
			trpcRevalidation({ key: ["artist", "get"], params: { id } })
		} else if (type === "playlist") {
			trpcRevalidation({ key: ["playlist", "searchable"] })
			trpcRevalidation({ key: ["playlist", "get"], params: { id } })
		}
	}
})

workerSocketClient.metrics.subscribe({
	onData ({ type }) {
		console.log(`metrics ${type}`)
		if (type === "listen-count") {
			trpcRevalidation({ key: ["artist", "mostRecentListen"] })
			trpcRevalidation({ key: ["artist", "leastRecentListen"] })
			trpcRevalidation({ key: ["album", "mostRecentListen"] })
		} else if (type === "likes") {
			trpcRevalidation({ key: ["artist", "mostFav"] })
			trpcRevalidation({ key: ["album", "mostFav"] })
			trpcRevalidation({ key: ["genre", "mostFav"] })
		}
	}
})