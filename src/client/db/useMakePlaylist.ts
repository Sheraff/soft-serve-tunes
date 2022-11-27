import { type RefObject, useCallback, useMemo, startTransition } from "react"
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
import { useAtomValue, useSetAtom } from "jotai"
import { repeat, shuffle } from "components/Player"
import generateUniqueName from "utils/generateUniqueName"
import shuffleArray from "utils/shuffleArray"

/**
 * TODO: 
 * - exception: automatic playlists (by multi-criteria) aren't editable (also not implemented so not a problem)
 * - on playlist creation, if replaced playlist was a local-only playlist, store it (in memory only) & add button to "restore previous playlist"
 * - I'm not sure it's useful that a playlist name must be unique, maybe remove all that logic
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
	/** @description id of the server-side playlist (an id is only assigned when the playlist is saved) */
	id: string | null
	/** @description list of track IDs for the playlist, in the order they will be played (in shuffle, this is a different order from `tracks`) */
	order: string[]
}

export type Playlist = PlaylistMeta & {
	/** @description list of tracks for the playlist, in the order they appear visually */
	tracks: PlaylistTrack[]
}

async function setPlaylist(
	trpcClient: ReturnType<typeof trpc.useContext>,
	name: Playlist['name'],
	id: Playlist['id'],
	tracks: Playlist['tracks'],
	current?: Playlist['current'],
) {
	const regularOrder = tracks.map(({id}) => id)
	const order = shuffle.getValue()
		? shuffleArray(regularOrder)
		: regularOrder
	const newCurrent = current || order[0]
	trpcClient.queryClient.setQueryData<Playlist>(["playlist"], { tracks, current: newCurrent, name, id, order })
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
		storeInIndexedDB<PlaylistMeta>("appState", "playlist-meta", { current: newCurrent, name, id, order }),
	])
}

export function useSetPlaylist() {
	const trpcClient = trpc.useContext()
	return useCallback(async (
		name: Playlist['name'],
		id: Exclude<Playlist['id'], null>,
		tracks: Playlist['tracks']
	) => {
		await setPlaylist(trpcClient, name, id, tracks)
	}, [trpcClient])
}

async function uniqueNameFromName(trpcClient: ReturnType<typeof trpc.useContext>, name: string) {
	const playlists = await trpcClient.fetchQuery(["playlist.list"])
	return generateUniqueName(name, playlists)
}

async function makePlaylist(
	trpcClient: ReturnType<typeof trpc.useContext>,
	list: PlaylistTrack[],
	name: string,
) {
	const uniqueName = await uniqueNameFromName(trpcClient, name)
	await setPlaylist(trpcClient, uniqueName, null, list)
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
				order: meta?.order || tracks.map(({id}) => id),
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

export function useGetCurrentIndex() {
	const trpcClient = trpc.useContext()
	return useCallback(() => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error(`trying to find "playlist" index, but query doesn't exist yet`)
		}
		const index = playlist.tracks.findIndex(({id}) => id === playlist.current)
		if (index < 0) return undefined
		return index
	}, [trpcClient])
}

export function useNextTrack() {
	const repeatType = useAtomValue(repeat)
	const { data } = usePlaylist({select: ({tracks, current, order}) => {
		if (repeatType === 2) return undefined
		const index = order.findIndex((id) => id === current)
		if (index < 0) return undefined
		if (repeatType === 0 && index >= tracks.length - 1) return undefined
		const nextIndex = index >= tracks.length - 1
			? 0
			: index + 1
		const nextTrack = tracks.find(({id}) => id === order[nextIndex])
		return nextTrack
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
		async nextPlaylistIndex(audio: RefObject<HTMLAudioElement>) {
			const repeatType = repeat.getValue()
			if (repeatType === 2) {
				if (audio.current) {
					audio.current.currentTime = 0
					audio.current.play()
				}
				return
			}
			const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!playlist) {
				throw new Error(`trying to change "playlist" query, but query doesn't exist yet`)
			}
			const index = playlist.order.findIndex((id) => id === playlist.current)
			if (repeatType === 0 && index >= playlist.tracks.length - 1) {
				return
			}
			const newIndex = index >= playlist.tracks.length - 1
				? 0
				: index + 1
			
			const current = playlist.order[newIndex]!
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
			const index = playlist.order.findIndex((id) => id === playlist.current)
			const newIndex = index <= 0
				? playlist.tracks.length - 1
				: index - 1
			const current = playlist.order[newIndex]!
			// if "prev" gets us to the last item of the playlist, 
			// AND the playlist is shuffled, 
			// keep the order, but 0 starts at the last index
			// this is to avoid clicking "prev" and listening to a single track before reaching an "invisible" end
			const newOrder = index > 0 || !shuffle.getValue() || !playlist.order.length
				? playlist.order
				: [playlist.order.at(-1)!, ...playlist.order.slice(0, playlist.order.length - 1)]
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				current,
				order: newOrder,
			})
			await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				current,
				order: newOrder,
			}))
		}
	}), [trpcClient])
}

export function useAddToPlaylist() {
	const trpcClient = trpc.useContext()
	const {mutateAsync} = trpc.useMutation(["playlist.modify"])
	return useCallback(async (playlistId: string, track: {id: string}) => {
		const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		const isCurrent = playlistId === cache?.id
		if (!isCurrent) {
			return mutateAsync({
				type: "add-track",
				id: playlistId,
				params: {id: track.id},
			})
		}
		if (cache.order.some((id) => id === track.id)) {
			// playlist already contains track
			return
		}
		const fullTrack = trpcClient.getQueryData(["track.miniature", {id: track.id}])
		if (!fullTrack) {
			console.error(`We shouldn't be able to be here, adding a track to a playlist should only happen from the track, so it must be in the trpc cache`)
			return
		}
		const newTracks = [...cache.tracks, fullTrack]
		const newOrder = !shuffle.getValue()
			? [...cache.order, fullTrack.id]
			: [
				...(cache.current ? [cache.current] : []),
				...shuffleArray([
					...cache.order.filter((id) => id !== cache.current),
					fullTrack.id,
				])
			]
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
			...cache,
			tracks: newTracks,
			order: newOrder,
		})
		await Promise.all([
			storeInIndexedDB<PlaylistDBEntry>("playlist", fullTrack.id, {
				index: cache.tracks.length,
				track: fullTrack,
			}),
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				order: newOrder,
			})),
		])
		return mutateAsync({
			type: "add-track",
			id: playlistId,
			params: {id: fullTrack.id},
		})

	}, [trpcClient, mutateAsync])
}

const playNextStack: string[] = []

export function useAddNextToPlaylist() {
	const trpcClient = trpc.useContext()
	const {mutateAsync} = trpc.useMutation(["playlist.modify"])
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
			const baseOrder = cache.tracks.map(({id}) => id)
			const newOrder = shuffle.getValue()
				? forceCurrent
					? [track.id, ...shuffleArray(baseOrder)]
					: shuffleArray([track.id, ...baseOrder])
				: forceCurrent
					? [track.id, ...baseOrder]
					: [...baseOrder, track.id]
			
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...cache,
				current: forceCurrent ? track.id : undefined,
				tracks: forceCurrent ? [track, ...cache.tracks] : [...cache.tracks, track],
				order: newOrder,
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
					order: newOrder,
				})),
			])
			if (cache.id) {
				await mutateAsync({
					id: cache.id,
					type: "add-track",
					params: {
						id: track.id,
						index: forceCurrent ? 0 : cache.tracks.length,
					}
				})
			}
			
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
		 * 
		 * ---
		 * if playlist is currently shuffled, `order` and `tracks` are de-sync
		 * - order is the order in which tracks will be played
		 * - tracks is the order in which tracks will be displayed
		 * when adding via "play next", tracks are added "after the current" in both `order` and `tracks`
		 * so that they appear predictably in visual order below the current
		 * and they will play predictably in order after the current
		 * (after which "shuffle" will resume, meaning the rest of the playlist is out-of-sync between order and tracks)
		*/
		const currentIndex = cache.order.findIndex((id) => id === cache.current)
		const {index, isStack} = forceCurrent
			? {index: currentIndex + 1, isStack: true}
			: findEndOfStack(cache.order, currentIndex)
		const tracksIndex = cache.tracks.findIndex(({id}) => id === cache.order[index - 1]) + 1
		if (!isStack) {
			playNextStack.length = 0
		}
		playNextStack.push(track.id)
		const newOrder = [...cache.order]
		newOrder.splice(index, 0, track.id)
		trpc: {
			const newTracks = [...cache.tracks]
			newTracks.splice(tracksIndex, 0, track)
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...cache,
				current: forceCurrent ? track.id : cache.current,
				tracks: newTracks,
				order: newOrder,
			})
		}
		await Promise.all([
			storeInIndexedDB<PlaylistDBEntry>("playlist", track.id, {
				index: cache.tracks.length,
				track,
			}).then(() => reorderListInIndexedDB(cache.tracks.length, tracksIndex)),
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				current: forceCurrent ? track.id : cache.current,
				order: newOrder,
			})),
		])
		if (cache.id) {
			await mutateAsync({
				id: cache.id,
				type: "add-track",
				params: {
					id: track.id,
					index: tracksIndex,
				}
			})
		}
	}, [trpcClient, mutateAsync])
}

function findEndOfStack(order: Playlist['order'], currentIndex: number, isStack = false): {index: number, isStack: boolean} {
	const index = currentIndex + 1
	if (index === order.length) {
		return {index, isStack}
	}
	if (!playNextStack.includes(order[index]!)) {
		return {index, isStack}
	}
	return findEndOfStack(order, index, true)
}

export function useReorderPlaylist() {
	const trpcClient = trpc.useContext()
	const {mutateAsync} = trpc.useMutation(["playlist.modify"])
	return useCallback(async (oldIndex: number, newIndex: number) => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(['playlist'])
		if (!playlist) {
			throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
		}
		const newItems = [...playlist.tracks]
		const [item] = newItems.splice(oldIndex, 1)
		newItems.splice(newIndex, 0, item!)
		const newOrder = shuffle.getValue()
			? playlist.order // if playlist is already shuffled, `order` is not correlated to `tracks`, so only update tracks
			: newItems.map(({id}) => id) // if playlist is not shuffled, `order` is correlated to `tracks`, so update order too
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			tracks: newItems,
			order: newOrder,
		})
		if (shuffle.getValue()) {
			await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				order: newOrder,
			}))
		}
		await reorderListInIndexedDB(oldIndex, newIndex)
		if (playlist.id) {
			await mutateAsync({
				id: playlist.id,
				type: "reorder",
				params: {
					from: oldIndex,
					to: newIndex,
				}
			})
		}
	}, [trpcClient, mutateAsync])
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
			console.error(new Error(`couldn't open cursor on in indexedDB "playlist" to reorder list`, {cause: tx.error}))
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
	const {mutateAsync} = trpc.useMutation(["playlist.modify"])
	return useCallback(async (id: string) => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
		}
		let newCurrent = playlist.current
		if (id === playlist.current) {
			const index = playlist.order.findIndex(id => id === playlist.current)
			if (index < playlist.order.length - 1) {
				newCurrent = playlist.order[index + 1]!
			} else if (playlist.order.length === 1) {
				newCurrent = undefined
			} else {
				newCurrent = playlist.order.at(-1)!
			}
		}
		const newItems = playlist.tracks.filter(track => track.id !== id)
		const newOrder = playlist.order.filter(orderId => orderId !== id)
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			current: newCurrent,
			tracks: newItems,
			order: newOrder,
		})
		await Promise.all([
			deleteFromListInIndexedDB(id),
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				current: newCurrent,
				order: newOrder,
			})),
		])
		if (playlist.id) {
			await mutateAsync({
				id: playlist.id,
				type: "remove-track",
				params: {
					id,
				}
			})
		}
	}, [trpcClient, mutateAsync])
}

async function deleteFromListInIndexedDB(id: string) {
	const db = await openDB()
	const tx = db.transaction("playlist", "readwrite")
	const store = tx.objectStore("playlist")
	const cursorRequest = store.openCursor()
	return new Promise((resolve, reject) => {
		cursorRequest.onerror = () => {
			console.error(new Error(`couldn't open cursor on in indexedDB "playlist" to delete item`, {cause: tx.error}))
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

export function useShufflePlaylist() {
	const setShuffle = useSetAtom(shuffle)
	const trpcClient = trpc.useContext()
	return useCallback(() => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error(`trying to reorder "playlist" query, but query doesn't exist yet`)
		}
		const isShuffle = shuffle.getValue()
		setShuffle(isShuffle ? false : true)
		if (!isShuffle) {
			playNextStack.length = 0
		}
		startTransition(() => {
			const baseOrder = playlist.tracks.map(({id}) => id)
			const newOrder = isShuffle
				? baseOrder
				: (() => {
					if (playlist.current) {
						// if playlist has a current item, set the current at the top, shuffle the rest
						// this avoids setting shuffle on, only to have just 3 tracks playing and the playlist stopping because it
						// reached an "invisible" end
						return [playlist.current, ...shuffleArray(baseOrder.filter(id => id !== playlist.current))]
					} else {
						return shuffleArray(baseOrder)
					}
				})()
			trpcClient.queryClient.setQueryData<Playlist>(["playlist"], {
				...playlist,
				order: newOrder,
			})
			modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
				...meta,
				order: newOrder,
			}))
		})
	}, [setShuffle, trpcClient])
}

export function useRenamePlaylist() {
	const trpcClient = trpc.useContext()
	const {mutateAsync} = trpc.useMutation(["playlist.modify"])
	return useCallback(async (id: string, name: string) => {
		const playlist = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error(`trying to rename "playlist" query, but query doesn't exist yet`)
		}
		const uniqueName = await uniqueNameFromName(trpcClient, name)
		// @ts-expect-error -- hey if it wasn't there before, it's okay that it's not here now
		trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (a) => a ? ({...a, name: uniqueName}) : a)
		trpcClient.setQueryData(["playlist.get", {id}], (a) => a ? ({...a, name: uniqueName}) : null)
		await mutateAsync({
			id,
			type: "rename",
			params: {
				name: uniqueName
			}
		})
	}, [trpcClient, mutateAsync])
	}

export async function onPlaylistSaved(
	trpcClient: ReturnType<typeof trpc.useContext>,
	id: string | null,
	name: string | null,
) {
	trpcClient.queryClient.setQueryData<Playlist>(["playlist"], (data) => {
		if (!data) {
			throw new Error(`trying to add ID to "playlist" query, but query doesn't exist yet`)
		}
		return {
			...data,
			id,
			name: name ?? data.name,
		}
	})
	await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
		...meta,
		id,
		name: name ?? meta.name,
	}))
}