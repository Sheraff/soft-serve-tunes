import generateUniqueName from "utils/generateUniqueName"
import { type trpc } from "utils/trpc"

export default async function uniqueNameFromName(trpcClient: ReturnType<typeof trpc.useContext>, name: string) {
	const playlists = await trpcClient.playlist.list.fetch()
	return generateUniqueName(name, playlists)
}