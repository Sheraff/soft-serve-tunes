import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { trpc } from "utils/trpc"
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
		 * @param _id if no ID is provided, the local playlist will be renamed
		 */
		async (name: string, _id?: string) => {
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])

		if (!_id && !playlist) {
			throw new Error("No playlist id provided and no local playlist in cache")
		}

		const uniqueName = await uniqueNameFromName(trpcClient, name)
		
		// either both are undefined, or they match. Either way we rename the local playlist
		if (playlist?.id === _id) {
			queryClient.setQueryData<Playlist>(["playlist"], (a) => a ? ({...a, name: uniqueName}) : a)
		}
		
		const id = _id || playlist?.id

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