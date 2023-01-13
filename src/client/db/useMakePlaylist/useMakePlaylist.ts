import { useCallback } from "react"
import { trpc, type RouterInputs } from "utils/trpc"
import { useQueryClient } from "@tanstack/react-query"
import makePlaylist from "./makePlaylist"

/**
 * @description generates *local* playlist from `trpcClient.playlist.generate` and sets it in react-query cache and indexedDB (wrapper around `setPlaylist`)
 */
export function useMakePlaylist() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	return useCallback(async (
		params: RouterInputs["playlist"]["generate"],
		name: string,
	) => {
		const list = await trpcClient.playlist.generate.fetch(params)
		if (!list) return
		await makePlaylist(trpcClient, queryClient, list, name)
	}, [trpcClient, queryClient])
}

/**
 * @description generates *local* playlist from a list of track ids (all tracks must be in `trpc.track.miniature` cache)
 * and sets it in react-query cache and indexedDB (wrapper around `setPlaylist`)
 */
export function useCreatePlaylist() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	return useCallback(async (ids: string[]) => {
		const tracks = ids.map(id => {
			const track = trpcClient.track.miniature.getData({id})
			if (!track) throw new Error("Track not found")
			return {
				id,
				name: track.name,
				artist: track.artist,
				album: track.album,
			}
		})
		await makePlaylist(trpcClient, queryClient, tracks, "New Playlist")
	}, [trpcClient, queryClient])
}

/**
 * @description generates *remote* playlist from a list of track ids, does not change local playlist
 */
export function useCreateRemotePlaylist() {
	const trpcClient = trpc.useContext()
	const {mutate: savePlaylistMutation} = trpc.playlist.save.useMutation()
	return useCallback(async (ids: string[], name = "New Playlist") => {
		savePlaylistMutation({
			name,
			tracks: ids.map((id, index) => ({id, index}))
		}, {
			onSuccess(playlist) {
				if (!playlist) {
					throw new Error("Trying to create a playlist, but mutation returned null")
				}
				trpcClient.playlist.get.setData({id: playlist.id}, playlist)
			},
		})
	}, [trpcClient, savePlaylistMutation])
}
















