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
		tracks: Playlist["tracks"],
		id: Playlist["id"] = null,
		current?: string
	) => {
		await setPlaylist(queryClient, name, id, tracks, current)
	}, [queryClient])
}