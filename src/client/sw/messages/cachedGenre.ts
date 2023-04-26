/// <reference lib="webworker" />
import {
	type RouterOutputs,
	type TrpcResponse,
} from "utils/trpc"
import { CACHES } from "../utils/constants"
import { getAllCachedTracks } from "./cachedTrack"

/**
 * @todo genre.get is not used anywhere (so never in cache)
 * it was meant to be used for the genre page, but that page is not implemented yet
 * in the meantime, we're using playlist.generate to get the tracks of a genre, so we could use that here too
 */
async function getAllCachedGenres (trpcCache: Cache, mediaCache: Cache) {
	const [
		mediaIds,
		miniatureIds,
		getTracksMap,
	] = await Promise.all([
		getAllCachedTracks(trpcCache, mediaCache),
		trpcCache.keys(new URL("/api/trpc/genre.miniature", self.location.origin), { ignoreSearch: true })
			.then(keys => new Set(keys.map((key) => {
				const url = new URL(key.url)
				const param = url.searchParams.get("input")!
				const id = JSON.parse(param).json.id as string
				return id
			}))),
		trpcCache.matchAll(new URL("/api/trpc/genre.get", self.location.origin), { ignoreSearch: true })
			.then(async (responses) => {
				const tracksMap: Map<string, string[]> = new Map()
				await Promise.all(responses.map(async (response) => {
					const r = await response.json() as TrpcResponse<RouterOutputs["genre"]["get"]>
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

export async function messageListGenreCache ({ source }: ExtendableMessageEvent) {
	if (!source) return

	const [trpcCache, mediaCache] = await Promise.all([
		caches.open(CACHES.trpc),
		caches.open(CACHES.media)
	])

	const [
		genreIds,
		searchableEntry,
	] = await Promise.all([
		getAllCachedGenres(trpcCache, mediaCache),
		trpcCache.match(new URL("/api/trpc/genre.searchable", self.location.origin), { ignoreSearch: true })
			.then(r => r
				? r.json() as Promise<TrpcResponse<RouterOutputs["genre"]["searchable"]>>
				: null
			),
	])

	if (!searchableEntry) return source.postMessage({
		type: "sw-cached-genre-list",
		payload: {
			cached: [],
		},
	})

	const result = searchableEntry.result.data.json
		.filter(({ id }) => genreIds.has(id))

	source.postMessage({
		type: "sw-cached-genre-list",
		payload: {
			cached: result,
		},
	})
}