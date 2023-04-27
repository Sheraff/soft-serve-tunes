/// <reference lib="webworker" />
import {
	type RouterOutputs,
	type TrpcResponse,
} from "utils/trpc"
import { cacheMatchTrpcQuery } from "./utils"
import { getAllCachedAlbums } from "./cachedAlbum"
import { CACHES } from "../utils/constants"

export async function messageCheckArtistCache ({ id }: { id: string }, { source }: ExtendableMessageEvent) {
	if (!source) return

	const res = await Promise.all([
		cacheMatchTrpcQuery("artist.get", { id }),
		cacheMatchTrpcQuery("artist.miniature", { id }),
	])
	let cached = false
	const hasArtistData = res.filter(Boolean).length === 2
	if (hasArtistData) {
		const artistResponse = res[0]!
		const data = await artistResponse.json()
		findCaches: if (data?.result?.data?.json) {
			const cache = await caches.open(CACHES.media)
			const albums = data?.result?.data?.json.albums
			if (albums) for (const album of albums) {
				for (const track of album.tracks) {
					if (await cache.match(new URL(`/api/file/${track.id}`, self.location.origin), {
						ignoreVary: true,
						ignoreSearch: true,
					})) {
						cached = true
						break findCaches
					}
				}
			}
			const featured = data?.result?.data?.json.featured
			if (featured) for (const album of featured) {
				for (const track of album.tracks) {
					if (track.artist?.id !== id) continue
					if (await cache.match(new URL(`/api/file/${track.id}`, self.location.origin), {
						ignoreVary: true,
						ignoreSearch: true,
					})) {
						cached = true
						break findCaches
					}
				}
			}
			const tracks = data?.result?.data?.json.tracks
			if (tracks) for (const track of tracks) {
				if (await cache.match(new URL(`/api/file/${track.id}`, self.location.origin), {
					ignoreVary: true,
					ignoreSearch: true,
				})) {
					cached = true
					break findCaches
				}
			}
		}
	}
	source.postMessage({
		type: "sw-cached-artist", payload: {
			id,
			cached,
		}
	})
}

async function getAllCachedArtists (trpcCache: Cache, mediaCache: Cache) {
	const [
		albumIds,
		miniatureIds,
		getAlbumsMap,
	] = await Promise.all([
		getAllCachedAlbums(trpcCache, mediaCache),
		trpcCache.keys(new URL("/api/trpc/artist.miniature", self.location.origin), { ignoreSearch: true })
			.then(keys => new Set(keys.map((key) => {
				const url = new URL(key.url)
				const param = url.searchParams.get("input")!
				const id = JSON.parse(param).json.id as string
				return id
			}))),
		trpcCache.matchAll(new URL("/api/trpc/artist.get", self.location.origin), { ignoreSearch: true })
			.then(async (responses) => {
				const albumsMap: Map<string, string[]> = new Map()
				await Promise.all(responses.map(async (response) => {
					const r = await response.json() as TrpcResponse<RouterOutputs["artist"]["get"]>
					if (r.result.data.json)
						albumsMap.set(r.result.data.json.id, r.result.data.json.albums.map((album) => album.id))
					// TODO: also check `featured` and `tracks` (like above when checking if single artist is cached)
				}))
				return albumsMap
			}),
	])

	for (const id of miniatureIds) {
		const map = getAlbumsMap.get(id)
		if (!map) {
			miniatureIds.delete(id)
			continue
		}
		const hasAlbums = map.some((trackId) => albumIds.has(trackId))
		if (!hasAlbums) {
			miniatureIds.delete(id)
		}
	}

	return miniatureIds
}


export async function messageListArtistCache ({ source }: ExtendableMessageEvent) {
	if (!source) return

	const [trpcCache, mediaCache] = await Promise.all([
		caches.open(CACHES.trpc),
		caches.open(CACHES.media)
	])

	const [
		artistIds,
		searchableEntry,
	] = await Promise.all([
		getAllCachedArtists(trpcCache, mediaCache),
		trpcCache.match(new URL("/api/trpc/artist.searchable", self.location.origin), { ignoreSearch: true })
			.then(r => r
				? r.json() as Promise<TrpcResponse<RouterOutputs["artist"]["searchable"]>>
				: null
			),
	])

	if (!searchableEntry) return source.postMessage({
		type: "sw-cached-artist-list",
		payload: {
			cached: [],
		},
	})

	const result = searchableEntry.result.data.json
		.filter(({ id }) => artistIds.has(id))

	source.postMessage({
		type: "sw-cached-artist-list",
		payload: {
			cached: result,
		},
	})
}