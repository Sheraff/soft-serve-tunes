import { useQueryClient } from "@tanstack/react-query"
import { shuffle } from "components/Player"
import { useCallback } from "react"
import { trpc } from "utils/trpc"
import { modifyInIndexedDB } from "client/db/utils"
import deleteAndReorderListInIndexedDB from "./deleteAndReorderListInIndexedDB"
import { type Playlist, type PlaylistMeta } from "./types"
import { getPlaylistByIdRemoteOrLocal } from "./getRemotePlaylistAsLocal"

/**
 * @description reorder a playlist, remote and/or local
 */
export function useReorderPlaylist () {
	const queryClient = useQueryClient()
	const trpcClient = trpc.useContext()
	const { mutateAsync } = trpc.playlist.modify.useMutation()

	return useCallback(async (oldIndex: number, newIndex: number, id: Playlist["id"] = null) => {
		const { playlist, isLocal } = await getPlaylistByIdRemoteOrLocal(id, trpcClient, queryClient)

		const newItems = [...playlist.tracks]
		const [item] = newItems.splice(oldIndex, 1)
		newItems.splice(newIndex, 0, item!)
		const newOrder = shuffle.getValue()
			? playlist.order // if playlist is already shuffled, `order` is not correlated to `tracks`, so only update tracks
			: newItems.map(({ id }) => id) // if playlist is not shuffled, `order` is correlated to `tracks`, so update order too

		if (playlist.id) {
			trpcClient.playlist.get.setData({ id: playlist.id }, (old) => {
				if (!old) return old
				const tracks = newItems.reduce<typeof old["tracks"]>((acc, { id }) => {
					const track = old.tracks.find((track) => track.id === id)
					if (track) acc.push(track)
					return acc
				}, [])
				console.log("new", tracks)
				return {
					...old,
					tracks,
				}
			})
		}

		if (isLocal) {
			queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				tracks: newItems,
				order: newOrder,
			})
			if (shuffle.getValue()) {
				await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
					...meta,
					order: newOrder,
				}))
			}
			await deleteAndReorderListInIndexedDB(newOrder)
		}

		if (playlist.id) {
			await new Promise((resolve) => setTimeout(resolve, 1_000))
			await mutateAsync({
				id: playlist.id,
				type: "reorder",
				params: {
					from: oldIndex,
					to: newIndex,
				}
			})
		}
	}, [trpcClient, queryClient, mutateAsync])
}