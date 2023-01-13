import { type QueryClient } from "@tanstack/react-query"
import { type trpc } from "utils/trpc"
import { Playlist } from "./types"

/**
 * @description fetches a playlist and formats the output in the shape of a local playlist
 */
async function getRemotePlaylistAsLocal(id: string, trpcClient: ReturnType<typeof trpc.useContext>) {
	const result = await trpcClient.playlist.get.fetch({id})
	if (!result) throw new Error(`no playlist found with id ${id}`)
	const order = result.tracks.map(({id}) => id)
	return {
		current: undefined,
		name: result.name,
		id: result.id,
		tracks: result.tracks,
		order,
	}
}

/**
 * @description returns a playlist in the shape of a local playlist.
 * - If `id` is *not provided*, it will return the local playlist in cache.
 * - If `id` is *provided* and it doesn't match the local playlist in cache, it will fetch the remote playlist.
 * - If `id` is *provided* and it matches the local playlist in cache, it will return the local playlist in cache.
 */
export async function getPlaylistByIdRemoteOrLocal(
	id: string | undefined,
	trpcClient: ReturnType<typeof trpc.useContext>,
	queryClient: QueryClient,
) {
	const _playlist = queryClient.getQueryData<Playlist>(["playlist"])
	if (!id && !_playlist) {
		throw new Error("no playlist id provided, and no local playlist in cache")
	}

	const isLocal = _playlist && (!id || _playlist.id === id)

	if (!isLocal && !id) {
		throw new Error("this shouldn't be possible")
	}

	const playlist = isLocal
		? _playlist
		: await getRemotePlaylistAsLocal(id!, trpcClient)

	return {playlist, isLocal}
}