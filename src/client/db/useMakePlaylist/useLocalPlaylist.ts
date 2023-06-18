import { useQuery } from "@tanstack/react-query"
import { useNextCachedTrack } from "client/sw/useSWCached"
import { repeat } from "components/Player"
import { useEffect } from "react"
import { queryClient, trpc } from "utils/trpc"
import useIsOnline from "utils/typedWs/useIsOnline"
import extractPlaylistCredits from "./extractPlaylistCredits"
import { type Playlist, type PlaylistDBEntry, type PlaylistMeta } from "./types"
import { listAllFromIndexedDB, retrieveFromIndexedDB } from "client/db/utils"

const defaultPlaylist: Playlist = {
	id: null,
	current: undefined,
	name: "New Playlist",
	tracks: [],
	order: [],
}

async function playlistQueryFn(): Promise<Playlist> {
	const cache = queryClient.getQueryData<Playlist>(["playlist"])
	if (cache) return cache
	const [results, meta] = await Promise.all([
		listAllFromIndexedDB<PlaylistDBEntry>("playlist"),
		retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
	])
	const tracks = results
		.sort((a, b) => a.index - b.index)
		.map((item) => item.track)

	if (meta) {
		return {
			...meta,
			tracks,
		}
	}

	return {
		...defaultPlaylist,
		tracks,
		current: tracks[0]?.id,
		order: tracks.map(({ id }) => id),
	}
}

/**
 * @description reads the playlist from indexedDB into react-query cache
 */
export function usePreloadPlaylist() {
	useEffect(() => {
		playlistQueryFn().then((playlist) => {
			queryClient.setQueryData<Playlist>(["playlist"], playlist)
		})
	}, [])
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
	return useQuery<Playlist, unknown, T>(["playlist"], {
		queryFn: playlistQueryFn,
		enabled,
		cacheTime: 0,
		select,
	})
}


function selectDetails({ tracks, name, id }: Playlist) {
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
}
/**
 * @description `usePlaylist` wrapper that uses `extractPlaylistCredits` in the select function
 */
export function usePlaylistExtractedDetails() {
	const { data } = usePlaylist({ select: selectDetails })
	return data || {}
}

/**
 * @description `usePlaylist` wrapper that returns only the current track
 */
export function useCurrentTrack() {
	const { data } = usePlaylist({ select: ({ tracks, current }) => tracks.find(({ id }) => id === current) })
	return data
}

/**
 * @description stateless function to obtain the *local* playlist
 */
export function getPlaylist() {
	const playlist = queryClient.getQueryData<Playlist>(["playlist"])
	return playlist
}

/**
 * @description `usePlaylist` wrapper that returns the next track
 * based on `order`, `shuffle`, `repeat` and `online`. Returns `undefined`
 * if there is no next track (or if next track is same as current).
 */
export function useNextTrack() {
	const repeatType = repeat.useValue()
	const online = useIsOnline()
	const { data: { order = [], from } = {} } = usePlaylist({
		enabled: !online,
		select: ({ order, current }) => ({ order, from: order.findIndex((id) => id === current) + 1 }),
	})
	const { data: offlineNext } = useNextCachedTrack({
		enabled: !online,
		from: from!,
		loop: repeatType === 1,
		tracks: order!,
	})
	const { data } = usePlaylist({
		select: ({ tracks, current, order }) => {
			if (repeatType === 2) return undefined
			if (!online) return tracks.find(({ id }) => id === offlineNext)
			const index = order.findIndex((id) => id === current)
			if (index < 0) return undefined
			if (repeatType === 0 && index >= tracks.length - 1) return undefined
			const nextIndex = index >= tracks.length - 1
				? 0
				: index + 1
			const nextTrack = tracks.find(({ id }) => id === order[nextIndex])
			return nextTrack
		}
	})
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