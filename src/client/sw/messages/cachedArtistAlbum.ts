/// <reference lib="webworker" />
import {
	type RouteKey,
	type RouterInputs,
	type SecondRouteKey,
	type AllRoutesString,
	type RouterOutputs,
} from "utils/trpc"
import { CACHES } from "../utils/constants"

type TRPCResponse<P> = {
	result: {
		data: {
			json: P
		}
	}
}

function trpcQueryToCacheKey<
	A extends RouteKey,
	B extends SecondRouteKey<A>,
> (endpoint: `${A}.${B}` & AllRoutesString, json: RouterInputs[A][B]) {
	const url = new URL(`/api/trpc/${endpoint}`, self.location.origin)
	if (json) url.searchParams.set("input", JSON.stringify({ json }))
	return url
}

export async function messageCheckArtistCache ({ id }: { id: string }, { source }: ExtendableMessageEvent) {
	if (!source) return
	const params: MultiCacheQueryOptions = {
		ignoreVary: true,
		ignoreSearch: false,
		cacheName: CACHES.trpc,
	}
	const res = await Promise.all([
		caches.match(trpcQueryToCacheKey("artist.get", { id }), params),
		caches.match(trpcQueryToCacheKey("artist.miniature", { id }), params),
	])
	let cached = false
	const hasArtistData = res.filter(Boolean).length === 2
	if (hasArtistData) {
		const artistResponse = res[0]!
		const data = await artistResponse.json() as TRPCResponse<RouterOutputs["artist"]["get"]>
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

export async function messageCheckAlbumCache ({ id }: { id: string }, { source }: ExtendableMessageEvent) {
	if (!source) return
	const params: MultiCacheQueryOptions = {
		ignoreVary: true,
		ignoreSearch: false,
		cacheName: CACHES.trpc,
	}
	const res = await Promise.all([
		caches.match(trpcQueryToCacheKey("album.get", { id }), params),
		caches.match(trpcQueryToCacheKey("album.miniature", { id }), params),
	])
	let cached = false
	const hasAlbumData = res.filter(Boolean).length === 2
	if (hasAlbumData) {
		const cache = await caches.open(CACHES.media)
		const albumResponse = res[0]!
		const data = await albumResponse.json() as TRPCResponse<RouterOutputs["album"]["get"]>
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