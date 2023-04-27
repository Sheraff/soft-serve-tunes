/// <reference lib="webworker" />
import { type RouterOutputs, type TrpcResponse } from "utils/trpc"
import { CACHES } from "../utils/constants"
import { type JSONValue } from "superjson/dist/types"
import { deserialize } from "superjson"
import { checkTrackCache } from "client/sw/messages/utils"

export async function messageCheckTrackCache ({ id }: { id: string }, { source }: ExtendableMessageEvent) {
	if (!source) return

	let cached = false
	checkCache: {
		const hasMedia = await caches.match(new URL(`/api/file/${id}`, self.location.origin), {
			ignoreVary: true,
			ignoreSearch: true,
			cacheName: CACHES.media,
		})
		if (!hasMedia) break checkCache
		const url = new URL("/api/trpc/track.miniature", self.location.origin)
		url.searchParams.set("input", `{"json":{"id":"${id}"}}`)
		const hasTrpc = await caches.match(url, {
			ignoreVary: true,
			ignoreSearch: false,
			cacheName: CACHES.trpc,
		})
		cached = Boolean(hasTrpc)
	}
	source.postMessage({
		type: "sw-cached-track", payload: {
			id,
			cached,
		}
	})
}

export async function messageCheckFirstCachedTrack ({
	params,
	id
}: {
	params: {
		from: number,
		loop: boolean,
		tracks: string[],
		direction?: 1 | -1,
	},
	id: string
}, {
	source
}: ExtendableMessageEvent
) {
	if (!source) return
	const [mediaCache, trpcCache] = await Promise.all([caches.open(CACHES.media), caches.open(CACHES.trpc)])
	let next = null
	const reverse = params.direction === -1
	const max = reverse
		? params.loop
			? params.from - params.tracks.length
			: -1
		: params.loop
			? params.from + params.tracks.length
			: params.tracks.length
	for (
		let i = params.from;
		reverse ? i > max : i < max;
		reverse ? i-- : i++
	) {
		const track = params.tracks[(i + params.tracks.length) % params.tracks.length]!
		if (await checkTrackCache(mediaCache, trpcCache, track)) {
			next = track
			break
		}
	}
	source.postMessage({
		type: "sw-first-cached-track", payload: {
			id,
			next,
		}
	})
}

export async function getAllCachedTracks (trpcCache: Cache, mediaCache: Cache) {
	const [
		miniatureIds,
		mediaIds,
	] = await Promise.all([
		trpcCache.keys(new URL("/api/trpc/track.miniature", self.location.origin), { ignoreSearch: true })
			.then(keys => new Set(keys.map((key) => {
				const url = new URL(key.url)
				const param = url.searchParams.get("input")!
				const id = JSON.parse(param).json.id as string
				return id
			}))),
		mediaCache.keys()
			.then(keys => new Set(keys.map((key) => key.url.split("/").at(-1)!))),
	] as const)

	for (const mediaId of mediaIds) {
		if (!miniatureIds.has(mediaId)) {
			await mediaIds.delete(mediaId)
		}
	}

	return mediaIds
}

export async function messageListTrackCache ({ source }: ExtendableMessageEvent) {
	if (!source) return

	const [trpcCache, mediaCache] = await Promise.all([
		caches.open(CACHES.trpc),
		caches.open(CACHES.media)
	])

	const [
		mediaIds,
		searchableData,
	] = await Promise.all([
		getAllCachedTracks(trpcCache, mediaCache),
		trpcCache.match(new URL("/api/trpc/track.searchable", self.location.origin), { ignoreSearch: true })
			.then(r => r
				? r.json() as Promise<TrpcResponse<JSONValue>>
				: null
			),
	] as const)

	if (!searchableData) return source.postMessage({
		type: "sw-cached-track-list",
		payload: {
			cached: [],
		},
	})

	const searchableEntry = deserialize<RouterOutputs["track"]["searchable"]>(searchableData.result.data)
	const result = searchableEntry.filter(({ id }) => mediaIds.has(id))

	source.postMessage({
		type: "sw-cached-track-list",
		payload: {
			cached: result,
		},
	})
}