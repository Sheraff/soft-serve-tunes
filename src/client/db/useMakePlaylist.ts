import { useCallback, useMemo } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import { countFromIndexedDB, deleteAllFromIndexedDB, listAllFromIndexedDB, openDB, retrieveFromIndexedDB, storeInIndexedDB, storeListInIndexedDB } from "./utils"
import { useQuery } from "react-query"

/**
 * - store in indexedDB "appState" the index of the playlist
 * - store in indexedDB "appState" the origin of the playlist (fully local === from artist, album, genre, vs. from online === sqlite saved playlist)
 * - based on origin
 *   - if fully local,
 *     - offer to save playlist (in sqlite)
 *     - all changes are mirrored into indexedDB "playlist"
 *     - display name is something default ""
 *   - if from online,
 *     - explicit changes are mirrored into sqlite Playlist
 *     - only "play next" changes aren't
 *     - display name is user input
 * 
 * - exception: automatic playlists (by multi-criteria) aren't editable (also not implemented so not a problem)
 * 
 * - TODO "play next": where to add item ?
 *   assuming current playlist is A, B, C, with A currently playing, let's insert 1, 2, 3
 *     possible: A, B, C, 1, 2, 3
 *     possible: A, 3, 2, 1, B, C
 *     possible: A, 1, 2, 3, B, C
 * 
 * - TODO: reordering indexedDB doesn't seem to do anything
 */

type PlaylistTrack = Exclude<inferQueryOutput<"playlist.generate">, undefined>[number]

type PlaylistDBEntry = {
	/** @description index of order of tracks inside the playlist */
	index: number
	track: PlaylistTrack
}

type Playlist = {
	tracks: PlaylistTrack[],
	/** @description id of currently playing track */
	current: string | undefined
}

export function useMakePlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (
		params: inferHandlerInput<AppRouter['_def']['queries']["playlist.generate"]>[0]
	) => {
		const list = await trpcClient.fetchQuery(["playlist.generate", params])
		if (!list) return
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
			tracks: list,
			current: list[0]?.id,
		})
		await deleteAllFromIndexedDB("playlist")
		await storeListInIndexedDB<PlaylistDBEntry>("playlist", list.map((track, i) => ({
			key: track.id,
			result: {
				index: i,
				track,
			}
		})))
	}, [trpcClient])
}

export function usePlaylist<T = Playlist>({select}: {select?: (playlist: Playlist) => T} = {}) {
	const trpcClient = trpc.useContext()
	return useQuery<Playlist, unknown, T>(["playlist"], {
		async queryFn() {
			const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (cache) return cache
			const results = await listAllFromIndexedDB<PlaylistDBEntry>("playlist")
			const tracks = results
				.sort((a, b) => a.index - b.index)
				.map((item) => item.track)
			return {
				tracks,
				current: tracks[0]?.id,
			}
		},
		cacheTime: 0,
		select,
	})
}

export function useCurrentTrack() {
	const { data } = usePlaylist({select: ({tracks, current}) => tracks.find(({id}) => id === current)})
	return data
}

export function useNextTrack() {
	const { data } = usePlaylist({select: ({tracks, current}) => {
		const index = tracks.findIndex(({id}) => id === current)
		if (index < 0) return undefined
		return tracks[index >= tracks.length - 1 ? 0 : (index + 1)]
	}})
	return data
}

export function useCurrentTrackDetails() {
	const track = useCurrentTrack()

	const { data } = trpc.useQuery(["track.miniature", {
		id: track?.id as string
	}], {
		enabled: Boolean(track),
	})

	return data
}

export function useSetPlaylistIndex() {
	const trpcClient = trpc.useContext()
	return useMemo(() => ({
		setPlaylistIndex(index: number) {
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (playlist) => {
				if (!playlist) {
					throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
				}
				const newIndex = index < 0
					? playlist.tracks.length - 1
					: index >= playlist.tracks.length
					? 0
					: index
				const current = playlist.tracks[newIndex]!.id
				return {
					...playlist,
					current,
				}
			})
		},
		nextPlaylistIndex() {
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (playlist) => {
				if (!playlist) {
					throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
				}
				const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
				const newIndex = index >= playlist.tracks.length
					? 0
					: index + 1
				const current = playlist.tracks[newIndex]!.id
				return {
					...playlist,
					current,
				}
			})
		},
		prevPlaylistIndex() {
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (playlist) => {
				if (!playlist) {
					throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
				}
				const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
				const newIndex = index <= 0
					? playlist.tracks.length - 1
					: index - 1
				const current = playlist.tracks[newIndex]!.id
				return {
					...playlist,
					current,
				}
			})
		}
	}), [trpcClient])
}

export function useAddToPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (track: PlaylistTrack) => {
		const index = await countFromIndexedDB("playlist")
		const inPlaylist = await retrieveFromIndexedDB<PlaylistDBEntry>("playlist", track.id)
		if (inPlaylist) {
			return
		}
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (playlist) => {
			if (!playlist) {
				return {
					current: track.id,
					tracks: [track],
				}
			}
			return {
				...playlist,
				tracks: [...playlist.tracks, track],
			}
		})
		await storeInIndexedDB<PlaylistDBEntry>("playlist", track.id, {
			index,
			track,
		})
	}, [trpcClient])
}

export function useReorderPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (oldIndex: number, newIndex: number) => {
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (playlist) => {
			if (!playlist) {
				throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
			}
			const newItems = [...playlist.tracks]
			const [item] = newItems.splice(oldIndex, 1)
			newItems.splice(newIndex, 0, item!)
			return {
				...playlist,
				tracks: newItems,
			}
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
				const item = cursor.value.result as PlaylistDBEntry
				if (item.index >= minIndex && item.index <= maxIndex) {
					if (item.index === oldIndex) {
						item.index === newIndex
					} else {
						item.index += direction
					}
					store.put({key: cursor.value.key, result: item})
				}
				cursor.continue()
			}
		}
		tx.oncomplete = resolve
	})
}