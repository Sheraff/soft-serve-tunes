import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { trpc } from "utils/trpc"
import isLocalFromPlaylistAndId from "./isLocalFromPlaylistAndId"
import { type Playlist } from "./types"
import uniqueNameFromName from "./uniqueNameFromName"

/**
 * @description Rename playlist, either locally or remotely
 */
export function useRenamePlaylist() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	const {mutateAsync} = trpc.playlist.modify.useMutation()

	return useCallback(
		/**
		 * @param name new name for playlist, will be made unique if necessary
		 * @param id if no ID is provided, the local playlist will be renamed
		 */
		async (name: string, id: Playlist["id"] = null) => {
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])

		const uniqueName = await uniqueNameFromName(trpcClient, name, id)
		
		const isLocal = isLocalFromPlaylistAndId(playlist, id)
		if (isLocal) {
			queryClient.setQueryData<Playlist>(["playlist"], (a) => a ? ({...a, name: uniqueName}) : a)
		}

		// if no ID was passed, and the local playlist isn't saved remotely (no id), nothing more to do
		if (!id) {
			return
		}

		trpcClient.playlist.get.setData({id}, (a) => a ? ({...a, name: uniqueName}) : null)
		await mutateAsync({
			id,
			type: "rename",
			params: {
				name: uniqueName
			}
		})
	}, [trpcClient, queryClient, mutateAsync])
}