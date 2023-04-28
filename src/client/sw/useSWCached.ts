import { type FetchQueryOptions, type UseQueryOptions, useQuery } from "@tanstack/react-query"
import { type RouterOutputs, queryClient } from "utils/trpc"

type SWQueryEvent =
	| "sw-cached-track"
	| "sw-cached-album"
	| "sw-cached-artist"
	| "sw-cached-playlist"
	| "sw-cached-genre"
	| "sw-cached-track-list"
	| "sw-cached-album-list"
	| "sw-cached-artist-list"
	| "sw-cached-playlist-list"
	| "sw-cached-genre-list"

type SWQueryPayload = {
	id?: string,
	enabled?: boolean,
}

function getSWQueryOptions<T> (
	type: SWQueryEvent,
	fallback: T,
	params?: SWQueryPayload
): UseQueryOptions<T, unknown, T, (string | undefined)[]> & FetchQueryOptions<T, unknown, T, (string | undefined)[]> {
	const withId = params && ("id" in params)
	return {
		enabled: Boolean(!withId || params.id) && params?.enabled !== false,
		queryKey: withId ? [type, params.id] : [type],
		queryFn ({ signal }) {
			if (!("serviceWorker" in navigator)) return fallback
			if (withId && !params.id) return fallback
			const controller = new AbortController()
			// signal will always be defined on browsers that support it, and I only care about modern browsers
			signal!.onabort = () => controller.abort()
			return new Promise<T>(async (resolve, reject) => {
				const registration = await navigator.serviceWorker.ready
				const target = registration.active
				if (!target) {
					return reject(new Error("no active SW registration"))
				}
				navigator.serviceWorker.addEventListener("message", (event) => {
					const message = event.data
					if (message.type !== type) return
					if (withId && message.payload.id !== params.id) return
					resolve(message.payload.cached)
					controller.abort()
				}, { signal: controller.signal })
				target.postMessage({ type, payload: withId ? { id: params.id } : {} })
				controller.signal.onabort = () => reject(new Error("stale SW query"))
			})
		},
		staleTime: 60_000,
		cacheTime: Infinity,
		networkMode: "offlineFirst",
	}
}

function useSWQuery<T> (type: SWQueryEvent, fallback: T, params?: SWQueryPayload) {
	return useQuery(getSWQueryOptions<T>(type, fallback, params))
}

function prefetchSWQuery<T> (type: SWQueryEvent, fallback: T, params?: SWQueryPayload) {
	return queryClient.prefetchQuery(getSWQueryOptions<T>(type, fallback, params))
}

export function useCachedTrack (params: SWQueryPayload) {
	return useSWQuery<boolean>("sw-cached-track", false, params)
}

export function useCachedTrackList (params?: { enabled?: boolean }) {
	return useSWQuery<RouterOutputs["track"]["searchable"]>("sw-cached-track-list", [], params)
}

export function prefetchCachedTrackList () {
	return prefetchSWQuery<RouterOutputs["track"]["searchable"]>("sw-cached-track-list", [])
}

export function useCachedAlbum (params: SWQueryPayload) {
	return useSWQuery<boolean>("sw-cached-album", false, params)
}

export function useCachedAlbumList (params?: { enabled?: boolean }) {
	return useSWQuery<RouterOutputs["album"]["searchable"]>("sw-cached-album-list", [], params)
}

export function prefetchCachedAlbumList () {
	return prefetchSWQuery<RouterOutputs["album"]["searchable"]>("sw-cached-album-list", [])
}

export function useCachedArtist (params: SWQueryPayload) {
	return useSWQuery<boolean>("sw-cached-artist", false, params)
}

export function useCachedArtistList (params?: { enabled?: boolean }) {
	return useSWQuery<RouterOutputs["artist"]["searchable"]>("sw-cached-artist-list", [], params)
}

export function prefetchCachedArtistList () {
	return prefetchSWQuery<RouterOutputs["artist"]["searchable"]>("sw-cached-artist-list", [])
}

export function useCachedPlaylist (params: SWQueryPayload) {
	return useSWQuery<boolean>("sw-cached-playlist", false, params)
}

export function useCachedPlaylistList (params?: { enabled?: boolean }) {
	return useSWQuery<RouterOutputs["playlist"]["searchable"]>("sw-cached-playlist-list", [], params)
}

export function prefetchCachedPlaylistList () {
	return prefetchSWQuery<RouterOutputs["playlist"]["searchable"]>("sw-cached-playlist-list", [])
}

export function useCachedGenre (params: SWQueryPayload) {
	return useSWQuery<boolean>("sw-cached-genre", false, params)
}

export function useCachedGenreList (params?: { enabled?: boolean }) {
	return useSWQuery<RouterOutputs["genre"]["searchable"]>("sw-cached-genre-list", [], params)
}

export function prefetchCachedGenreList () {
	return prefetchSWQuery<RouterOutputs["genre"]["searchable"]>("sw-cached-genre-list", [])
}

export async function findFirstCachedTrack (
	params: {
		from: number,
		loop: boolean,
		tracks: string[],
		direction?: 1 | -1,
	},
	signal?: AbortSignal
) {
	if (!("serviceWorker" in navigator)) return null
	const controller = new AbortController()
	if (signal) {
		signal.onabort = () => controller.abort()
	}
	const found = await new Promise<string | null>(async (resolve, reject) => {
		const id = Math.random().toString(36).slice(2)
		const registration = await navigator.serviceWorker.ready
		const target = registration.active
		if (!target) {
			return reject(new Error("no active SW registration"))
		}
		navigator.serviceWorker.addEventListener("message", (event) => {
			const message = event.data
			if (message.type === "sw-first-cached-track" && message.payload.id === id) {
				resolve(message.payload.next as string | null)
				controller.abort()
			}
		}, { signal: controller.signal })
		target.postMessage({ type: "sw-first-cached-track", payload: { params, id } })
		controller.signal.onabort = () => reject(new Error("stale SW query"))
	})
	return found
}

export function useNextCachedTrack ({
	enabled,
	...params
}: {
	tracks: string[],
	enabled?: boolean,
	from: number,
	loop: boolean,
	direction?: 1 | -1,
}) {
	const query = useQuery({
		enabled: params.tracks.length > 0 && enabled !== false,
		queryKey: ["sw-first-cached-track", params],
		queryFn ({ signal }) {
			return findFirstCachedTrack(params, signal)
		},
		networkMode: "offlineFirst",
	})
	return query
}