/// <reference lib="webworker" />
import {
	type RouterOutputs,
	type TrpcResponse,
} from "utils/trpc"
import { CACHES } from "../utils/constants"
import { getAllCachedTracks } from "./cachedTrack"

async function getAllCachedPlaylists (trpcCache: Cache, mediaCache: Cache) {
	const [
		mediaIds,
		playlistTracksMap,
	] = await Promise.all([
		getAllCachedTracks(trpcCache, mediaCache),
		trpcCache.matchAll(new URL("/api/trpc/playlist.get", self.location.origin), { ignoreSearch: true })
			.then(async (responses) => {
				const tracksMap: Map<string, string[]> = new Map()
				await Promise.all(responses.map(async (response) => {
					const r = await response.json() as TrpcResponse<RouterOutputs["playlist"]["get"]>
					if (r.result.data.json)
						tracksMap.set(r.result.data.json.id, r.result.data.json.tracks.map((track) => track.id))
				}))
				return tracksMap
			}),
	])

	for (const [id, tracks] of playlistTracksMap) {
		const hasTracks = tracks.some((trackId) => mediaIds.has(trackId))
		if (!hasTracks) {
			playlistTracksMap.delete(id)
		}
	}

	return playlistTracksMap
}

export async function messageListPlaylistCache ({ source }: ExtendableMessageEvent) {
	if (!source) return

	const [trpcCache, mediaCache] = await Promise.all([
		caches.open(CACHES.trpc),
		caches.open(CACHES.media)
	])

	const [
		playlistIds,
		searchableEntry,
	] = await Promise.all([
		getAllCachedPlaylists(trpcCache, mediaCache),
		trpcCache.match(new URL("/api/trpc/playlist.searchable", self.location.origin), { ignoreSearch: true })
			.then(r => r
				? r.json() as Promise<TrpcResponse<RouterOutputs["playlist"]["searchable"]>>
				: null
			),
	])

	if (!searchableEntry) return source.postMessage({
		type: "sw-cached-playlist-list",
		payload: {
			cached: [],
		},
	})

	const result = searchableEntry.result.data.json
		.filter(({ id }) => playlistIds.has(id))

	source.postMessage({
		type: "sw-cached-playlist-list",
		payload: {
			cached: result,
		},
	})
}