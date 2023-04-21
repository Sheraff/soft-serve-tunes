import { type trpc } from "utils/trpc"
import { setPlaylist } from "./setPlaylist"
import { type PlaylistTrack } from "./types"
import uniqueNameFromName from "./uniqueNameFromName"

/**
 * @description creates a unique name and sets the *local* playlist in react-query cache and indexedDB (wrapper around `setPlaylist`)
 */
export default async function makePlaylist (
	trpcClient: ReturnType<typeof trpc.useContext>,
	list: PlaylistTrack[],
	name: string,
) {
	const uniqueName = await uniqueNameFromName(trpcClient, name)
	await setPlaylist(uniqueName, list)
}