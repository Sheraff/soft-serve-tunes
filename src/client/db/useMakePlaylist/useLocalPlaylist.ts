import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { useNextCachedTrack } from "client/sw/useCachedTrack"
import { repeat } from "components/Player"
import { useCallback, useEffect } from "react"
import { trpc } from "utils/trpc"
import useIsOnline from "utils/typedWs/useIsOnline"
import extractPlaylistCredits from "./extractPlaylistCredits"
import { type Playlist, type PlaylistDBEntry, type PlaylistMeta } from "./types"
import { listAllFromIndexedDB, retrieveFromIndexedDB } from "client/db/utils"

async function playlistQueryFn(queryClient: QueryClient) {
	const cache = queryClient.getQueryData<Playlist>(["playlist"])
	if (cache) return cache
	const [results, meta] = await Promise.all([
		listAllFromIndexedDB<PlaylistDBEntry>("playlist"),
		retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
	])
	const tracks = results
		.sort((a, b) => a.index - b.index)
		.map((item) => item.track)
	return {
		id: meta?.id || null,
		current: meta?.current || tracks[0]?.id,
		name: meta?.name || "New Playlist",
		tracks,
		order: meta?.order || tracks.map(({id}) => id),
	}
}

/**
 * @description reads the playlist from indexedDB into react-query cache
 */
export function usePreloadPlaylist() {
	const queryClient = useQueryClient()
	useEffect(() => {
		playlistQueryFn(queryClient).then((playlist) => {
			queryClient.setQueryData<Playlist>(["playlist"], playlist)
		})
	}, [queryClient])
}

/**
 * @description `useQuery` wrapper for local playlist
 */
export function usePlaylist<T = Playlist>({
	select,
	enabled = true,
}: {
	select?: (playlist: Playlist) => T,
	enabled?: boolean,
} = {}) {
	const queryClient = useQueryClient()
	return useQuery<Playlist, unknown, T>(["playlist"], {
		queryFn() {
			return playlistQueryFn(queryClient)
		},
		enabled,
		cacheTime: 0,
		select,
	})
}

/**
 * @description `usePlaylist` wrapper that uses `extractPlaylistCredits` in the select function
 */
export function usePlaylistExtractedDetails() {
	const {data} = usePlaylist(({select: ({tracks, name, id}) => {
		if (!tracks || !tracks.length) return {}

		const credits = extractPlaylistCredits(tracks)

		return {
			id,
			name,
			length: tracks.length,
			albums: credits.albums.slice(0, 6),
			artists: credits.artists.slice(0, 6),
			moreAlbums: credits.albums.length > 6,
			moreArtists: credits.artists.length > 6,
		}
	}}))
	return data || {}
}

/**
 * @description `usePlaylist` wrapper that returns only the current track
 */
export function useCurrentTrack() {
	const { data } = usePlaylist({select: ({tracks, current}) => tracks.find(({id}) => id === current)})
	return data
}

/**
 * @description stateless function to obtain the current index of the *local* playlist
 */
export function useGetCurrentIndex() {
	const queryClient = useQueryClient()
	return useCallback(() => {
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error("trying to find \"playlist\" index, but query doesn't exist yet")
		}
		const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
		if (index < 0) return undefined
		return index
	}, [queryClient])
}

/**
 * @description `usePlaylist` wrapper that returns the next track based on `order`, `shuffle`, `repeat` and `online`
 */
export function useNextTrack() {
	const repeatType = repeat.useValue()
	const online = useIsOnline()
	const { data: {order = [], from} = {} } = usePlaylist({
		enabled: !online,
		select: ({order, current}) => ({order, from: order.findIndex((id) => id === current) + 1}),
	})
	const { data: offlineNext } = useNextCachedTrack({
		enabled: !online,
		from: from!,
		loop: repeatType === 1,
		tracks: order!,
	})
	const { data } = usePlaylist({select: ({tracks, current, order}) => {
		if (repeatType === 2) return undefined
		if (!online) return tracks.find(({id}) => id === offlineNext)
		const index = order.findIndex((id) => id === current)
		if (index < 0) return undefined
		if (repeatType === 0 && index >= tracks.length - 1) return undefined
		const nextIndex = index >= tracks.length - 1
			? 0
			: index + 1
		const nextTrack = tracks.find(({id}) => id === order[nextIndex])
		return nextTrack
	}})
	return data
}

/**
 * @description `trpc.track.miniature.useQuery` wrapper that fetches the current *local* playlist track
 */
export function useCurrentTrackDetails() {
	const track = useCurrentTrack()

	const { data } = trpc.track.miniature.useQuery({
		id: track?.id as string
	}, {
		enabled: Boolean(track),
	})

	return data
}