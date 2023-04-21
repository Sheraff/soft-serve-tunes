import { type PlaylistDBEntry, type Playlist, PlaylistMeta } from "./types"
import { repeat, shuffle } from "components/Player"
import shuffleArray from "utils/shuffleArray"
import { findFirstCachedTrack } from "client/sw/useSWCached"
import { deleteAllFromIndexedDB, storeInIndexedDB, storeListInIndexedDB } from "client/db/utils"
import { queryClient } from "utils/trpc"

/**
 * @description sets the *local* playlist in react-query cache and indexedDB
 */
export async function setPlaylist (
	name: Playlist["name"],
	tracks: Playlist["tracks"],
	id: Playlist["id"] = null,
	current?: Playlist["current"],
) {
	const regularOrder = tracks.map(({ id }) => id)
	const order = shuffle.getValue()
		? shuffleArray(regularOrder)
		: regularOrder
	const newCurrent = await (async () => {
		if (globalWsClient.wsClient?.serverState !== false) {
			return current || order[0]
		}
		const nextCached = await findFirstCachedTrack({
			tracks: order,
			from: current ? order.indexOf(current) + 1 : 0,
			loop: repeat.getValue() === 1,
		})
		return nextCached || current || order[0]
	})()
	const meta = {
		current: newCurrent,
		name,
		id,
		order,
	}
	queryClient.setQueryData<Playlist>(["playlist"], { tracks, ...meta })
	await Promise.all([
		deleteAllFromIndexedDB("playlist").then(() => (
			storeListInIndexedDB<PlaylistDBEntry>("playlist", tracks.map((track, i) => ({
				key: track.id,
				result: {
					index: i,
					track,
				}
			})))
		)),
		storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", meta),
	])
}