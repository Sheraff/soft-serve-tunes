import { useCallback, useMemo } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import {
	deleteAllFromIndexedDB,
	listAllFromIndexedDB,
	modifyInIndexedDB,
	openDB,
	retrieveFromIndexedDB,
	storeInIndexedDB,
	storeListInIndexedDB,
} from "./utils"
import { useQuery } from "react-query"
import extractPlaylistCredits from "./utils/extractPlaylistCredits"

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
 * - [x] auto-generate name for playlist based on how it was created (+ check server for existing name and add "#2" if necessary)
 * - [x] save name in "appState"
 * - [x] display name on playlist screen
 * - [x] add save button, on save prompt user for playlist name, with auto-generated name as prefill
 *     - [ ] if a playlist is saved, show "edit name" button next to title,
 *       show "delete playlist" button instead of "save playlist"
 * - [ ] create PlaylistList component for search screen / suggestion screen, on click, set playlist
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
	name: string
	/** @description id of the server-side playlist (if any) */
	id: string | null
}

export type Playlist = PlaylistMeta & {
	tracks: PlaylistTrack[]
}

async function setPlaylist(
	trpcClient: ReturnType<typeof trpc.useContext>,
	name: Playlist['name'],
	id: Playlist['id'],
	current: Playlist['current'],
	tracks: Playlist['tracks']
) {
	trpcClient.queryClient.setQueryData<Playlist>(["playlist"], { tracks, current, name, id })
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
		storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", { current, name, id }),
	])
}

export function useSetPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (
		name: Playlist['name'],
		id: Exclude<Playlist['id'], null>,
		tracks: Playlist['tracks']
	) => {
		await setPlaylist(trpcClient, name, id, tracks[0]?.id, tracks)
	}, [trpcClient])
}

async function makePlaylist(
	trpcClient: ReturnType<typeof trpc.useContext>,
	list: PlaylistTrack[],
	name: string,
) {
	const playlists = await trpcClient.fetchQuery(["playlist.list"])
	let appendCount = 1
	let uniqueName: string
	do {
		uniqueName = appendCount > 1 ? `${name} #${appendCount}` : name
		appendCount += 1
	} while (playlists.some(({name}) => name === uniqueName))
	await setPlaylist(trpcClient, uniqueName, null, list[0]?.id, list)
}

export function useMakePlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (
		params: inferHandlerInput<AppRouter['_def']['queries']["playlist.generate"]>[0],
		name: string,
	) => {
		const list = await trpcClient.fetchQuery(["playlist.generate", params])
		if (!list) return
		await makePlaylist(trpcClient, list, name)
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
				id: meta?.id || null,
				current: meta?.current || tracks[0]?.id,
				name: meta?.name || "New Playlist",
				tracks,
			}
		},
		cacheTime: 0,
		select,
	})
}

export function usePlaylistExtractedDetails() {
	const {data} = usePlaylist(({select: ({tracks, name, id}) => {
		if (!tracks || !tracks.length) return {}

		const credits = extractPlaylistCredits(tracks)

		return {
			id,
			name,
			length: tracks.length,
			albums: credits.albums.slice(0, 6),
			artists: credits.artists.slice(0, 6),
			moreAlbums: credits.albums.length > 6,
			moreArtists: credits.artists.length > 6,
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
			await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
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
			await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
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
			await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
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
			await makePlaylist(trpcClient, [track], "New Playlist")
			return
		}
		// playlist already contains track, do nothing
		if (cache.tracks.some(({id}) => id === track.id)) {
			if (forceCurrent) {
				trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
					...cache,
					current: track.id,
				})
				await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
					...meta,
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
				modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
					...meta,
					current: forceCurrent ? track.id : undefined,
				})),
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
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				current: forceCurrent ? track.id : cache.current,
			})),
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

	console.log('reorder indexedDB', oldIndex, newIndex)

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
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				current: newCurrent,
			})),
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

export async function onPlaylistSaved(
	trpcClient: ReturnType<typeof trpc.useContext>,
	id: string | null,
) {
	trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (data) => {
		if (!data) {
			throw new Error(`trying to add ID to "playlist" query, but query doesn't exist yet`)
		}
		return {...data, id}
	})
	await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
		...meta,
		id,
	}))
}