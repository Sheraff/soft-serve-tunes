import { useQueryClient } from "@tanstack/react-query"
import { shuffle } from "components/Player"
import { useCallback } from "react"
import shuffleArray from "utils/shuffleArray"
import { trpc } from "utils/trpc"
import { modifyInIndexedDB, storeInIndexedDB } from "client/db/utils"
import { type Playlist, type PlaylistDBEntry, type PlaylistMeta } from "./types"
import isLocalFromPlaylistAndId from "./isLocalFromPlaylistAndId"

/**
 * @description add a track to a playlist, remote and/or local
 */
export function useAddToPlaylist() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	const {mutateAsync} = trpc.playlist.modify.useMutation()
	return useCallback(async (
		playlistId: Playlist["id"] = null,
		track: {id: string} | {id: string}[],
	) => {
		const tracks = Array.isArray(track) ? track : [track]
		const cache = queryClient.getQueryData<Playlist>(["playlist"])
		const isLocal = isLocalFromPlaylistAndId(cache, playlistId)
		if (!isLocal) {
			await mutateAsync({
				type: "add-track",
				id: playlistId!,
				params: {id: tracks.map(({id}) => id)},
			})
			return
		}
		const filteredTracks = tracks.filter((track) => !cache.order.includes(track.id))
		if (filteredTracks.length === 0) {
			// playlist already contains track
			return
		}
		const _fullTracks = (await Promise.all(tracks.map((track) => {
			const existing = trpcClient.track.miniature.getData({id: track.id})
			if (existing) {
				return existing
			}
			return trpcClient.track.miniature.fetch({id: track.id})
		}))).filter(Boolean) // filter in case some `id`s returned a null track from the .fetch call
		const fullTracks = _fullTracks as Exclude<typeof _fullTracks[number], undefined | null>[]
		const newTracks = [...cache.tracks, ...fullTracks]
		const newOrder = !shuffle.getValue(queryClient)
			? [...cache.order, ...fullTracks.map(({id}) => id)]
			// TODO: below shouldn't reshuffle entire playlist, just everything after what's been played so far (up to and including cache.current in cache.order)
			// TODO: bonus would be to also not shuffle any of the current stack of "play next" tracks
			: [
				...(cache.current ? [cache.current] : []),
				...shuffleArray([
					...cache.order.filter((id) => id !== cache.current),
					...fullTracks.map(({id}) => id),
				])
			]
		queryClient.setQueryData<Playlist>(["playlist"], {
			...cache,
			tracks: newTracks,
			order: newOrder,
		})
		await Promise.all([
			...fullTracks.map((fullTrack, i) =>
				storeInIndexedDB<PlaylistDBEntry>("playlist", fullTrack.id, {
					index: cache.tracks.length + i,
					track: fullTrack,
				})
			),
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (data) => ({
				...data,
				order: newOrder,
			})),
		])
		if (playlistId) {
			await mutateAsync({
				type: "add-track",
				id: playlistId,
				params: {id: tracks.map(({id}) => id)},
			})
		}

	}, [trpcClient, queryClient, mutateAsync])
}