/// <reference lib="webworker" />
import { type AllRoutes, type RouterInputs } from "utils/trpc"
import { workerSocketClient } from "utils/typedWs/vanilla-client"
import { deserialize, serialize } from "superjson"
import { addToBatch } from "client/sw/trpc/batch"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

type BatchRevalidationItem<TRouteKey extends AllRoutes> = {
	payload: { key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]] }
	invalidate: boolean
}

const batchRevalidation: Array<BatchRevalidationItem<AllRoutes>> = []
let revalidationTimeout: ReturnType<typeof setTimeout> | null = null

function processRevalidation() {
	revalidationTimeout = null
	batchRevalidation.forEach(({ payload, invalidate }) => {
		addToBatch(payload.key.join("."), JSON.stringify(serialize(payload.params)), true)
			.then(async (body) => {
				const data = JSON.parse(body)
				const clients = await self.clients.matchAll()
				clients.forEach(client => {
					if (data.result?.data) {
						const item_data = deserialize(data.result.data)
						client.postMessage({ type: "sw-trpc-invalidation", payload, data: item_data })
					} else if (invalidate) {
						client.postMessage({ type: "sw-trpc-invalidation", payload })
					}
				})
			})
	})
	batchRevalidation.length = 0
}

export default function trpcRevalidation<
	TRouteKey extends AllRoutes
>(
	payload: BatchRevalidationItem<TRouteKey>["payload"],
	invalidate: BatchRevalidationItem<TRouteKey>["invalidate"] = true,
) {
	batchRevalidation.push({ payload, invalidate })
	if (revalidationTimeout) {
		clearTimeout(revalidationTimeout)
	}
	revalidationTimeout = setTimeout(processRevalidation, 1_000)
}

workerSocketClient.add.subscribe({
	onData({ type, id }) {
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
	onData({ type, id }) {
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
	onData({ type, id }) {
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
	onData({ type }) {
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