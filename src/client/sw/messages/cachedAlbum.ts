/// <reference lib="webworker" />
import {
	type RouterOutputs,
	type TrpcResponse,
} from "utils/trpc"
import { cacheMatchTrpcQuery } from "./utils"
import { CACHES } from "../utils/constants"
import { getAllCachedTracks } from "./cachedTrack"

export async function messageCheckAlbumCache ({ id }: { id: string }, { source }: ExtendableMessageEvent) {
	if (!source) return

	const res = await Promise.all([
		cacheMatchTrpcQuery("album.get", { id }),
		cacheMatchTrpcQuery("album.miniature", { id }),
	])
	let cached = false
	const hasAlbumData = res.filter(Boolean).length === 2
	if (hasAlbumData) {
		const cache = await caches.open(CACHES.media)
		const albumResponse = res[0]!
		const data = await albumResponse.json()
		if (data?.result?.data?.json) {
			for (const track of data?.result?.data?.json.tracks) {
				if (await cache.match(new URL(`/api/file/${track.id}`, self.location.origin), {
					ignoreVary: true,
					ignoreSearch: true,
				})) {
					cached = true
					break
				}
			}
		}
	}
	source.postMessage({
		type: "sw-cached-album", payload: {
			id,
			cached,
		}
	})
}

export async function getAllCachedAlbums (trpcCache: Cache, mediaCache: Cache) {
	const [
		mediaIds,
		miniatureIds,
		getTracksMap,
	] = await Promise.all([
		getAllCachedTracks(trpcCache, mediaCache),
		trpcCache.keys(new URL("/api/trpc/album.miniature", self.location.origin), { ignoreSearch: true })
			.then(keys => new Set(keys.map((key) => {
				const url = new URL(key.url)
				const param = url.searchParams.get("input")!
				const id = JSON.parse(param).json.id as string
				return id
			}))),
		trpcCache.matchAll(new URL("/api/trpc/album.get", self.location.origin), { ignoreSearch: true })
			.then(async (responses) => {
				const tracksMap: Map<string, string[]> = new Map()
				await Promise.all(responses.map(async (response) => {
					const r = await response.json() as TrpcResponse<RouterOutputs["album"]["get"]>
					if (r.result.data.json)
						tracksMap.set(r.result.data.json.id, r.result.data.json.tracks.map((track) => track.id))
				}))
				return tracksMap
			}),
	])

	for (const id of miniatureIds) {
		const map = getTracksMap.get(id)
		if (!map) {
			miniatureIds.delete(id)
			continue
		}
		const hasTracks = map.some((trackId) => mediaIds.has(trackId))
		if (!hasTracks) {
			miniatureIds.delete(id)
		}
	}

	return miniatureIds
}

export async function messageListAlbumCache ({ source }: ExtendableMessageEvent) {
	if (!source) return

	const [trpcCache, mediaCache] = await Promise.all([
		caches.open(CACHES.trpc),
		caches.open(CACHES.media)
	])

	const [
		albumIds,
		searchableEntry,
	] = await Promise.all([
		getAllCachedAlbums(trpcCache, mediaCache),
		trpcCache.match(new URL("/api/trpc/album.searchable", self.location.origin), { ignoreSearch: true })
			.then(r => r
				? r.json() as Promise<TrpcResponse<RouterOutputs["album"]["searchable"]>>
				: null
			),
	])

	if (!searchableEntry) return source.postMessage({
		type: "sw-cached-album-list",
		payload: {
			cached: [],
		},
	})

	const result = searchableEntry.result.data.json
		.filter(({ id }) => albumIds.has(id))

	source.postMessage({
		type: "sw-cached-album-list",
		payload: {
			cached: result,
		},
	})
}