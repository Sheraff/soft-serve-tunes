import { useCallback, useMemo } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import {
	countFromIndexedDB,
	deleteAllFromIndexedDB,
	listAllFromIndexedDB,
	openDB,
	retrieveFromIndexedDB,
	storeInIndexedDB,
	storeListInIndexedDB,
} from "./utils"
import { useQuery } from "react-query"

/**
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
 * ACTION PLAN:
 * - auto-generate name for playlist based on how it was created (+ check server for existing name and add "#2" if necessary)
 * - save name in "appState"
 * - display name on playlist screen
 * - add save button, on save prompt user for playlist name, with auto-generated name as prefill
 * - create PlaylistList component for search screen / suggestion screen, on click, set playlist
 *     - if replaced playlist was a local-only playlist, store it (in memory only) & add button to "restore previous playlist"
 */

type PlaylistTrack = Exclude<inferQueryOutput<"playlist.generate">, undefined>[number]

type PlaylistDBEntry = {
	/** @description index of order of tracks inside the playlist */
	index: number
	track: PlaylistTrack
}

type PlaylistMeta = {
	/** @description id of currently playing track */
	current: string | undefined
}

type Playlist = PlaylistMeta & {
	tracks: PlaylistTrack[]
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
		await storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
			current: list[0]?.id,
		})
	}, [trpcClient])
}

export function usePlaylist<T = Playlist>({select}: {select?: (playlist: Playlist) => T} = {}) {
	const trpcClient = trpc.useContext()
	return useQuery<Playlist, unknown, T>(["playlist"], {
		async queryFn() {
			const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (cache) return cache
			const [results, meta] = await Promise.all([
				listAllFromIndexedDB<PlaylistDBEntry>("playlist"),
				retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
			])
			const tracks = results
				.sort((a, b) => a.index - b.index)
				.map((item) => item.track)
			return {
				...(meta || {
					current: tracks[0]?.id
				}),
				tracks,
			}
		},
		cacheTime: 0,
		select,
	})
}

export function usePlaylistExtractedDetails() {
	const {data} = usePlaylist(({select: ({tracks}) => {
		if (!tracks || !tracks.length) return {}

		const counts = tracks.reduce((acc, track) => {
			if (track.album) {
				const count = acc.albums.get(track.album.id)
				if (!count) acc.albums.set(track.album.id, 1)
				else acc.albums.set(track.album.id, count + 1)
			}
			if (track.artist) {
				const count = acc.artists.get(track.artist.id)
				if (!count) acc.artists.set(track.artist.id, 1)
				else acc.artists.set(track.artist.id, count + 1)
			}
			return acc
		}, {
			albums: new Map<string, number>(),
			artists: new Map<string, number>(),
		})

		const albums = Array.from(counts.albums.entries()).sort((a, b) => b[1] - a[1])
		const artists = Array.from(counts.albums.entries()).sort((a, b) => b[1] - a[1])
		return {
			albums: albums.slice(0, 6),
			artists: artists.slice(0, 6),
		}
	}}))
	return data || {}
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
		async setPlaylistIndex(index: number) {
			const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!playlist) {
				throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
			}
			const newIndex = index < 0
				? playlist.tracks.length - 1
				: index >= playlist.tracks.length
				? 0
				: index
			const current = playlist.tracks[newIndex]!.id
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				current,
			})
			await retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
				.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					...(meta || {}),
					current,
				}))
		},
		async nextPlaylistIndex() {
			const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!playlist) {
				throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
			}
			const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
			const newIndex = index >= playlist.tracks.length
				? 0
				: index + 1
			const current = playlist.tracks[newIndex]!.id
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				current,
			})
			await retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
				.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					...(meta || {}),
					current,
				}))
		},
		async prevPlaylistIndex() {
			const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!playlist) {
				throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
			}
			const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
			const newIndex = index <= 0
				? playlist.tracks.length - 1
				: index - 1
			const current = playlist.tracks[newIndex]!.id
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				current,
			})
			await retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
				.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					...(meta || {}),
					current,
				}))
		}
	}), [trpcClient])
}

const playNextStack: string[] = []

export function useAddNextToPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (track: PlaylistTrack, forceCurrent?: boolean) => {
		const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		// playlist doesn't exist, create it with new track as current
		if (!cache) {
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				current: track.id,
				tracks: [track],
			})
			await Promise.all([
				storeInIndexedDB<PlaylistDBEntry>("playlist", track.id, {
					index: 0,
					track,
				}),
				storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					current: track.id
				}),
			])
			return
		}
		// playlist already contains track, do nothing
		if (cache.tracks.some(({id}) => id === track.id)) {
			if (forceCurrent) {
				trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
					...cache,
					current: track.id,
				})
				await retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
					.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
						...(meta || {}),
						current: track.id,
					}))
			}
			return
		}
		// playlist is inactive, just add track to the end (or to the start if `forceCurrent`)
		if (typeof cache.current === 'undefined') {
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...cache,
				current: forceCurrent ? track.id : undefined,
				tracks: forceCurrent ? [track, ...cache.tracks] : [...cache.tracks, track],
			})
			await Promise.all([
				storeInIndexedDB<PlaylistDBEntry>("playlist", track.id, {
					index: cache.tracks.length,
					track,
				}).then(() => {
					if (forceCurrent) {
						return reorderListInIndexedDB(cache.tracks.length, 0)
					}
				}),
				retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
					.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
						...(meta || {}),
						current: forceCurrent ? track.id : undefined,
					}))
			])
			
			return
		}
		/**
		 * add after current, and after other "just added"
		 * ---
		 * Explanation of expected behavior:
		 * assuming current playlist is A, B, C, with A currently playing, 
		 * if we insert 1, 2, 3
		 * playlist is now A, 1, 2, 3, B, C
		 * if currently playing progresses to 1, and we insert another 4
		 * playlist is now A, 1, 2, 3, 4, B, C
		 * if currently playing progresses to B, and we insert another 5, 6
		 * playlist is now A, 1, 2, 3, 4, B, 5, 6, C
		*/
		const currentIndex = cache.tracks.findIndex(({id}) => id === cache.current)
		const {index, isStack} = forceCurrent
			? {index: currentIndex + 1, isStack: true}
			: findEndOfStack(cache.tracks, currentIndex)
		if (!isStack) {
			playNextStack.length = 0
		}
		playNextStack.push(track.id)
		trpc: {
			const newItems = [...cache.tracks]
			newItems.splice(index, 0, track)
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...cache,
				current: forceCurrent ? track.id : cache.current,
				tracks: newItems,
			})
		}
		await Promise.all([
			storeInIndexedDB<PlaylistDBEntry>("playlist", track.id, {
				index: cache.tracks.length,
				track,
			}).then(() => reorderListInIndexedDB(cache.tracks.length, index)),
			retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
				.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					...(meta || {}),
					current: forceCurrent ? track.id : cache.current,
				}))
		])
	}, [trpcClient])
}

function findEndOfStack(tracks: Playlist['tracks'], currentIndex: number, isStack = false): {index: number, isStack: boolean} {
	const index = currentIndex + 1
	if (index === tracks.length) {
		return {index, isStack}
	}
	if (!playNextStack.includes(tracks[index]!.id)) {
		return {index, isStack}
	}
	return findEndOfStack(tracks, index, true)
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
						item.index = newIndex
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

export function useRemoveFromPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (id: string) => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
		}
		let newCurrent = playlist.current
		if (id === playlist.current) {
			const index = playlist.tracks.findIndex(track => track.id === playlist.current)
			if (index < playlist.tracks.length - 1) {
				newCurrent = playlist.tracks[index + 1]!.id
			} else if (playlist.tracks.length === 1) {
				newCurrent = undefined
			} else {
				newCurrent = playlist.tracks.at(-1)!.id
			}
		}
		const newItems = playlist.tracks.filter(track => track.id !== id)
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			current: newCurrent,
			tracks: newItems,
		})
		await Promise.all([
			deleteFromListInIndexedDB(id),
			retrieveFromIndexedDB<PlaylistMeta>("appState", "playlist-meta")
				.then((meta) => storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", {
					...(meta || {}),
					current: newCurrent,
				}))
		])
	}, [trpcClient])
}

async function deleteFromListInIndexedDB(id: string) {
	const db = await openDB()
	const tx = db.transaction("playlist", "readwrite")
	const store = tx.objectStore("playlist")
	const cursorRequest = store.openCursor()
	return new Promise((resolve, reject) => {
		cursorRequest.onerror = () => {
			console.error(`couldn't open cursor on in indexedDB "playlist" to delete item`)
			reject(tx.error)
		}
		let hasDeleted = false
		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result
			if (cursor) {
				const item = cursor.value.result as PlaylistDBEntry
				if (!hasDeleted && item.track.id === id) {
					cursor.delete()
					hasDeleted = true
				}
				if (hasDeleted) {
					store.put({key: cursor.value.key, result: {...item, index: item.index - 1}})
				}
				cursor.continue()
			}
		}
		tx.oncomplete = resolve
	})
}