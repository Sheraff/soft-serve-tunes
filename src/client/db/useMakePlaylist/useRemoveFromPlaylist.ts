import { useQueryClient } from "@tanstack/react-query"
import { trpc } from "utils/trpc"
import { modifyInIndexedDB } from "client/db/utils"
import deleteAndReorderListInIndexedDB from "./deleteAndReorderListInIndexedDB"
import { type Playlist, type PlaylistMeta } from "./types"
import { useCallback } from "react"
import { getPlaylistByIdRemoteOrLocal } from "./getRemotePlaylistAsLocal"

/**
 * @description remove a track from a playlist, remote and/or local
 */
export function useRemoveFromPlaylist() {
	const queryClient = useQueryClient()
	const trpcClient = trpc.useContext()
	const {mutateAsync} = trpc.playlist.modify.useMutation()

	return useCallback(async (trackId: string, playlistId?: string) => {
		const {playlist, isLocal} = await getPlaylistByIdRemoteOrLocal(playlistId, trpcClient, queryClient)

		if (playlist.id) {
			trpcClient.playlist.get.setData({id: playlist.id}, (old) => {
				if (!old) return old
				const tracks = old.tracks.filter(track => track.id !== trackId)
				return {
					...old,
					tracks,
				}
			})
		}

		if (isLocal) {
			let newCurrent = playlist.current
			if (trackId === playlist.current) {
				const index = playlist.order.findIndex(id => id === playlist.current)
				if (index < playlist.order.length - 1) {
					newCurrent = playlist.order[index + 1]!
				} else if (playlist.order.length === 1) {
					newCurrent = undefined
				} else {
					newCurrent = playlist.order.at(-1)!
				}
			}
			const newItems = playlist.tracks.filter(track => track.id !== trackId)
			const newOrder = playlist.order.filter(orderId => orderId !== trackId)
			queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				current: newCurrent,
				tracks: newItems,
				order: newOrder,
			})
			await Promise.all([
				deleteAndReorderListInIndexedDB(newOrder),
				modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
					...meta,
					current: newCurrent,
					order: newOrder,
				})),
			])
		}

		if (playlist.id) {
			await mutateAsync({
				id: playlist.id,
				type: "remove-track",
				params: {
					id: trackId,
				}
			})
		}
	}, [trpcClient, queryClient, mutateAsync])
}