import { useQueryClient } from "@tanstack/react-query"
import { shuffle } from "components/Player"
import { useCallback } from "react"
import shuffleArray from "utils/shuffleArray"
import { trpc } from "utils/trpc"
import { modifyInIndexedDB, storeInIndexedDB } from "client/db/utils"
import { type Playlist, type PlaylistDBEntry, type PlaylistMeta } from "./types"

/**
 * @description add a track to a playlist, remote and/or local
 */
export function useAddToPlaylist() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	const {mutateAsync} = trpc.playlist.modify.useMutation()
	return useCallback(async (playlistId: string, track: {id: string} | {id: string}[]) => {
		const tracks = Array.isArray(track) ? track : [track]
		const cache = queryClient.getQueryData<Playlist>(["playlist"])
		const isCurrent = playlistId === cache?.id
		if (!isCurrent) {
			return mutateAsync({
				type: "add-track",
				id: playlistId,
				params: {id: tracks.map(({id}) => id)},
			})
		}
		const filteredTracks = tracks.filter((track) => !cache.order.includes(track.id))
		if (filteredTracks.length === 0) {
			// playlist already contains track
			return
		}
		const _fullTracks = tracks.map((track) => trpcClient.track.miniature.getData({id: track.id}))
		if (_fullTracks.includes(undefined) || _fullTracks.includes(null)) {
			console.error("We shouldn't be able to be here, adding a track to a playlist should only happen from the track, so it must be in the trpc cache")
			return
		}
		const fullTracks = _fullTracks as Exclude<typeof _fullTracks[number], undefined | null>[]
		const newTracks = [...cache.tracks, ...fullTracks]
		const newOrder = !shuffle.getValue(queryClient)
			? [...cache.order, ...fullTracks.map(({id}) => id)]
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
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				order: newOrder,
			})),
		])
		return mutateAsync({
			type: "add-track",
			id: playlistId,
			params: {id: fullTracks.map(({id}) => id)},
		})

	}, [trpcClient, queryClient, mutateAsync])
}