import { useQueryClient } from "@tanstack/react-query"
import { startTransition, useCallback } from "react"
import { queryClient, trpc } from "utils/trpc"
import { modifyInIndexedDB, storeInIndexedDB } from "client/db/utils"
import makePlaylist from "./makePlaylist"
import { type PlaylistMeta, type Playlist, type PlaylistTrack, type PlaylistDBEntry } from "./types"
import { shuffle } from "components/Player"
import shuffleArray from "utils/shuffleArray"
import deleteAndReorderListInIndexedDB from "./deleteAndReorderListInIndexedDB"

const playNextStack: string[] = []

/**
 * @description add a track to *local* playlist,
 * track will be added to the "play next" stack, meaning that
 * even if the playlist is shuffled, the track will be played next
 * (or after the rest of the stack if it's not empty).
 * 
 * If the track is already in the playlist, this function will do nothing.
 * 
 * If the playlist doesn't exist, it will be created with the track as first and current.
 */
export function useAddNextToPlaylist () {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	const { mutateAsync } = trpc.playlist.modify.useMutation()
	return useCallback(async (track: PlaylistTrack, forceCurrent?: boolean) => {
		const cache = queryClient.getQueryData<Playlist>(["playlist"])
		// playlist doesn't exist, create it with new track as current
		if (!cache) {
			await makePlaylist(trpcClient, [track], "New Playlist")
			return
		}
		// playlist already contains track, do nothing
		if (cache.tracks.some(({ id }) => id === track.id)) {
			if (forceCurrent) {
				queryClient.setQueryData<Playlist>(["playlist"], {
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
		if (typeof cache.current === "undefined") {
			const baseOrder = cache.tracks.map(({ id }) => id)
			const newOrder = shuffle.getValue()
				? forceCurrent
					? [track.id, ...shuffleArray(baseOrder)]
					: shuffleArray([track.id, ...baseOrder])
				: forceCurrent
					? [track.id, ...baseOrder]
					: [...baseOrder, track.id]

			queryClient.setQueryData<Playlist>(["playlist"], {
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
						return deleteAndReorderListInIndexedDB(newOrder)
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
		 * so that they appear predictably in order below the current
		 * and they will play predictably in order after the current
		 * (after which "shuffle" will resume, meaning the rest of the playlist is out-of-sync between order and tracks)
		*/
		const currentIndex = cache.order.findIndex((id) => id === cache.current)
		const { index, isStack } = forceCurrent
			? { index: currentIndex + 1, isStack: true }
			: findEndOfStack(cache.order, currentIndex)
		const tracksIndex = cache.tracks.findIndex(({ id }) => id === cache.order[index - 1]) + 1
		if (!isStack) {
			playNextStack.length = 0
		}
		playNextStack.push(track.id)
		const newOrder = [...cache.order]
		newOrder.splice(index, 0, track.id)
		trpc: {
			const newTracks = [...cache.tracks]
			newTracks.splice(tracksIndex, 0, track)
			queryClient.setQueryData<Playlist>(["playlist"], {
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
			}).then(() => deleteAndReorderListInIndexedDB(newOrder)),
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
	}, [trpcClient, queryClient, mutateAsync])
}

function findEndOfStack (order: Playlist["order"], currentIndex: number, isStack = false): { index: number, isStack: boolean } {
	const index = currentIndex + 1
	if (index === order.length) {
		return { index, isStack }
	}
	if (!playNextStack.includes(order[index]!)) {
		return { index, isStack }
	}
	return findEndOfStack(order, index, true)
}

/**
 * @description shuffle the playlist.
 * The "static" order will not change (order of un-shuffled playlist / order of playlist on server).
 * The current track will be the first track in the new order.
 */
export function shufflePlaylist () {
	const playlist = queryClient.getQueryData<Playlist>(["playlist"])
	if (!playlist) {
		throw new Error("trying to reorder \"playlist\" query, but query doesn't exist yet")
	}
	const isShuffle = shuffle.getValue()
	if (!isShuffle) {
		playNextStack.length = 0
	}
	startTransition(() => {
		shuffle.setState(isShuffle ? false : true)
		const baseOrder = playlist.tracks.map(({ id }) => id)
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
		queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			order: newOrder,
		})
		modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
			...meta,
			order: newOrder,
		}))
	})
}

/**
 * @description Change track order in "play order" but not in "static order".
 * This should only matter when they are not the same: when the playlist is shuffled.
 */
export function setPlayOrder (oldIndex: number, newIndex: number) {
	const cache = queryClient.getQueryData<Playlist>(["playlist"])
	// playlist doesn't exist, create it with new track as current
	if (!cache) {
		throw new Error("trying to change play order of local \"playlist\" query, but query doesn't exist yet")
	}
	const trackId = cache.order[oldIndex]!
	const newOrder = [...cache.order]
	newOrder.splice(oldIndex, 1)
	newOrder.splice(newIndex, 0, trackId)

	queryClient.setQueryData<Playlist>(["playlist"], {
		...cache,
		order: newOrder,
	})
	playNextStack.length = 0
}
