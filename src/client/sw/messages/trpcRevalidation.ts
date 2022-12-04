/// <reference lib="webworker" />
import { type AllRoutes, type AllInputs, type RouterInputs } from "utils/trpc"
import { workerSocketClient } from "utils/typedWs/vanilla-client"
import { handleTrpcFetchResponse } from "../fetch/trpc"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

const batch: {
	items: {key: AllRoutes, params?: AllInputs}[]
	timeoutId: ReturnType<typeof setTimeout> | null
} = {
	items: [],
	timeoutId: null,
}

function joinRoute(key: AllRoutes) {
	return key.join('.') as `${typeof key[0]}.${typeof key[1]}`
}

function processBatch() {
	const items = batch.items
	batch.timeoutId = null
	batch.items = []

	if (items.length === 0) return

	const {endpoints, input} = items.reduce((params, item, i) => {
		params.endpoints.push(joinRoute(item.key))
		params.input[i] = item.params
			? {json: item.params}
			: {json:null, meta:{values:["undefined"]}}
		return params
	}, {endpoints: [], input: {}} as {endpoints: ReturnType<typeof joinRoute>[], input: Record<number, unknown>})

	const url = new URL(`/api/trpc/${endpoints.join(',')}`, self.location.origin)
	url.searchParams.set('batch', '1')
	url.searchParams.set('input', JSON.stringify(input))

	fetch(url).then(async response => {
		if (response.status === 200 || response.status === 207) {
			await handleTrpcFetchResponse(response, url)
			const clients = await self.clients.matchAll()
			clients.forEach(client => {
				items.forEach((payload) =>
					client.postMessage({type: 'sw-trpc-invalidation', payload})
				)
			})
		} else {
			console.warn('SW: failed trpc revalidation', response.status, response.statusText, url)
		}
	}).catch(() => {
		items.forEach(item => addItemToBatch(item))
	})
}

function isEquivalentItem<
	ARouteKey extends AllRoutes,
	BRouteKey extends AllRoutes,
>(
	a: {key: ARouteKey, params?: RouterInputs[ARouteKey[0]][ARouteKey[1]]},
	b: {key: BRouteKey, params?: RouterInputs[BRouteKey[0]][BRouteKey[1]]}
) {
	if (a.key[0] !== b.key[0]) return false
	if (a.key[1] !== b.key[1]) return false
	if (a.params === b.params) return true
	if (a.params === undefined || b.params === undefined) return false
	const aKeys = Object.keys(a.params)
	const bKeys = Object.keys(b.params)
	if (aKeys.length !== bKeys.length) return false
	for (let i = 0; i < aKeys.length; i++) {
		const key = aKeys[i]!
		if (a.params[key] !== b.params[key]) return false
	}
	return true
}

function addItemToBatch<
	TRouteKey extends AllRoutes
>(item: {key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]]}) {
	if (!batch.items.some(i => isEquivalentItem(i, item))) {
		batch.items.push(item)
	}
}

export default function trpcRevalidation<
	TRouteKey extends AllRoutes
>(item: {key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]]}) {
	addItemToBatch(item)
	if (!batch.timeoutId) {
		batch.timeoutId = setTimeout(processBatch, 10)
	}
}


workerSocketClient.metrics.subscribe({
	onData(data) {
		console.log('SW: metrics', data)
	},
})

workerSocketClient.add.subscribe({
	onData({type, id}) {
		console.log(`added ${type} ${id}`)
		if (type === "playlist") {
			trpcRevalidation({key: ["playlist", "list"]})
			trpcRevalidation({key: ["playlist", "searchable"]})
			return
		}
		trpcRevalidation({key: ["track", "searchable"]})
		trpcRevalidation({key: ["artist", "searchable"]})
		trpcRevalidation({key: ["album", "searchable"]})
		trpcRevalidation({key: ["genre", "list"]})
		if (type === "artist") {
			trpcRevalidation({key: ["artist", "miniature"], params: {id}})
			trpcRevalidation({key: ["artist", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'artist', id }})
		} else if (type === "album") {
			trpcRevalidation({key: ["album", "miniature"], params: {id}})
			trpcRevalidation({key: ["album", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'album', id }})
			trpcRevalidation({key: ["album", "mostRecentAdd"]})
		}
	}
})

workerSocketClient.remove.subscribe({
	onData({type, id}) {
		console.log(`removed ${type} ${id}`)
		if (type === "playlist") {
			trpcRevalidation({key: ["playlist", "list"]})
			trpcRevalidation({key: ["playlist", "searchable"]})
			trpcRevalidation({key: ["playlist", "get"], params: { id }})
		} else if (type === "track") {
			trpcRevalidation({key: ["track", "searchable"]})
			trpcRevalidation({key: ["track", "miniature"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'track', id }})
		} else if (type === "artist") {
			trpcRevalidation({key: ["artist", "searchable"]})
			trpcRevalidation({key: ["artist", "miniature"], params: {id}})
			trpcRevalidation({key: ["artist", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'artist', id }})
		} else if (type === "album") {
			trpcRevalidation({key: ["album", "searchable"]})
			trpcRevalidation({key: ["album", "miniature"], params: {id}})
			trpcRevalidation({key: ["album", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'album', id }})
		} else if (type === "genre") {
			trpcRevalidation({key: ["genre", "list"]})
			trpcRevalidation({key: ["genre", "miniature"], params: {id}})
			trpcRevalidation({key: ["genre", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "generate"], params: { type: 'genre', id }})
		}
	}
})

workerSocketClient.invalidate.subscribe({
	onData({type, id}) {
		console.log(`invalidated ${type} ${id}`)
		if (type === "track") {
			trpcRevalidation({key: ["track", "miniature"], params: {id}})
		} else if (type === "album") {
			trpcRevalidation({key: ["album", "miniature"], params: {id}})
			trpcRevalidation({key: ["album", "get"], params: {id}})
		} else if (type === "artist") {
			trpcRevalidation({key: ["artist", "miniature"], params: {id}})
			trpcRevalidation({key: ["artist", "get"], params: {id}})
		} else if (type === "playlist") {
			trpcRevalidation({key: ["playlist", "get"], params: {id}})
			trpcRevalidation({key: ["playlist", "list"]})
			trpcRevalidation({key: ["playlist", "searchable"]})
		}
	}
})

workerSocketClient.metrics.subscribe({
	onData({type}) {
		console.log(`metrics ${type}`)
		if (type === "listen-count") {
			trpcRevalidation({key: ["artist", "mostRecentListen"]})
			trpcRevalidation({key: ["artist", "leastRecentListen"]})
			trpcRevalidation({key: ["album", "mostRecentListen"]})
		} else if (type === "likes") {
			trpcRevalidation({key: ["artist", "mostFav"]})
			trpcRevalidation({key: ["album", "mostFav"]})
			trpcRevalidation({key: ["genre", "mostFav"]})
		}
	}
})