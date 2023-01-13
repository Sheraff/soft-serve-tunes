import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import setPlaylist from "./setPlaylist"
import { type Playlist } from "./types"

/**
 * @description sets the *local* playlist in react-query cache and indexedDB (wrapper around `setPlaylist`)
 */
export function useSetPlaylist() {
	const queryClient = useQueryClient()
	return useCallback(async (
		name: Playlist["name"],
		id: Exclude<Playlist["id"], null>,
		tracks: Playlist["tracks"],
		current?: string
	) => {
		await setPlaylist(queryClient, name, id, tracks, current)
	}, [queryClient])
}