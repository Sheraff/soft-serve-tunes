import { type useQueryClient } from "@tanstack/react-query"
import { modifyInIndexedDB } from "client/db/utils"
import { type Playlist, type PlaylistMeta } from "./types"

/**
 * @description sets the *local* playlist `id` and `name` from the return of a `trpc.playlist.save` mutation
 * (saving a playlist to the server returns the new playlist's ID and the name might have changed in case of collision)
 */
export async function onPlaylistSaved(
	queryClient: ReturnType<typeof useQueryClient>,
	id: string | null,
	name: string | null,
) {
	queryClient.setQueryData<Playlist>(["playlist"], (data) => {
		if (!data) {
			throw new Error("trying to add ID to \"playlist\" query, but query doesn't exist yet")
		}
		return {
			...data,
			id,
			name: name ?? data.name,
		}
	})
	await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
		...meta,
		id,
		name: name ?? meta.name,
	}))
}