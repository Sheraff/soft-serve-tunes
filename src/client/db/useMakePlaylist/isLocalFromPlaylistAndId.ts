import { Playlist } from "./types"


export default function isLocalFromPlaylistAndId(playlist: Playlist | undefined, id: string | null): playlist is Playlist {
	const isLocal = Boolean(playlist?.id === id)

	if (!isLocal && !id) {
		throw new Error("this shouldn't be possible")
	}

	return isLocal
}