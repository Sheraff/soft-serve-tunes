import { useCallback } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import { countFromIndexedDB, deleteAllFromIndexedDB, listAllFromIndexedDB, openDB, retrieveFromIndexedDB, storeInIndexedDB, storeListInIndexedDB } from "./utils"
import { useQuery } from "react-query"

type PlaylistEntry = {
	index: number
	track: Exclude<inferQueryOutput<"playlist.generate">, undefined>[number]
}

export default function useMakePlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (
		params: inferHandlerInput<AppRouter['_def']['queries']["playlist.generate"]>[0]
	) => {
		const list = await trpcClient.fetchQuery(["playlist.generate", params])
		if (!list) return
		trpcClient.queryClient.setQueryData<PlaylistEntry['track'][]>(["playlist"], list)
		await deleteAllFromIndexedDB("playlist")
		await storeListInIndexedDB<PlaylistEntry>("playlist", list.map((track, i) => ({
			key: track.id,
			result: {
				index: i,
				track,
			}
		})))
	}, [trpcClient])
}

export function usePlaylist() {
	return useQuery<PlaylistEntry['track'][]>(["playlist"], {
		async queryFn() {
			const results = await listAllFromIndexedDB<PlaylistEntry>("pastSearches")
			return results
				.sort((a, b) => b.index - a.index)
				.map((item) => item.track)
		},
		cacheTime: 0,
	})
}

export function useAddToPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (track: PlaylistEntry['track']) => {
		const index = await countFromIndexedDB("playlist")
		trpcClient.queryClient.setQueryData<PlaylistEntry['track'][]>(["playlist"], (items) => {
			if (!items) {
				throw new Error(`trying to add to "playlist" query, but query doesn't exist yet`)
			}
			return [...items, track]
		})
		await storeInIndexedDB<PlaylistEntry>("playlist", track.id, {
			index,
			track,
		})
	}, [trpcClient])
}

export function useReorderPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (oldIndex: number, newIndex: number) => {
		trpcClient.queryClient.setQueryData<PlaylistEntry['track'][]>(["playlist"], (items) => {
			if (!items) {
				throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
			}
			const newItems = [...items]
			const [item] = newItems.splice(oldIndex, 1)
			newItems.splice(newIndex, 0, item!)
			return newItems
		})
		await reorderListInIndexedDB(oldIndex, newIndex)
	}, [trpcClient])
}

async function reorderListInIndexedDB(oldIndex: number, newIndex: number) {
	const minIndex = Math.min(oldIndex, newIndex)
	const maxIndex = Math.max(oldIndex, newIndex)
	const direction = oldIndex < newIndex ? -1 : 1

	const db = await openDB()
	const tx = db.transaction("playlist", "readwrite")
	const store = tx.objectStore("playlist")
	const cursorRequest = store.openCursor()
	return new Promise((resolve, reject) => {
		cursorRequest.onerror = () => {
			console.error(`couldn't open cursor on in indexedDB "playlist" to reorder list`)
			reject(tx.error)
		}
		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result
			if (cursor) {
				const item = cursor.value as PlaylistEntry
				if (item.index >= minIndex && item.index <= maxIndex) {
					if (item.index === oldIndex) {
						item.index === newIndex
					} else {
						item.index += direction
					}
					store.put(item, cursor.key)
				}
				cursor.continue()
			}
		}
		tx.oncomplete = resolve
	})
}