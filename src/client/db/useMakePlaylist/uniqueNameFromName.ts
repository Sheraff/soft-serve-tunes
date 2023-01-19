import generateUniqueName from "utils/generateUniqueName"
import { type trpc } from "utils/trpc"
import { type Playlist } from "./types"

export default async function uniqueNameFromName(
	trpcClient: ReturnType<typeof trpc.useContext>,
	name: string,
	id: Playlist["id"] = null,
) {
	const playlists = await trpcClient.playlist.list.fetch()
	return generateUniqueName(
		name,
		playlists.filter((a) => a.id !== id)
	)
}