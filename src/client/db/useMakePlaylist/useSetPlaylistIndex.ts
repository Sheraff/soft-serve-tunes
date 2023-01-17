import { useQueryClient } from "@tanstack/react-query"
import { findFirstCachedTrack } from "client/sw/useSWCached"
import { repeat, shuffle } from "components/Player"
import { RefObject, useMemo } from "react"
import shuffleArray from "utils/shuffleArray"
import { modifyInIndexedDB } from "../utils"
import { Playlist, PlaylistMeta } from "./types"

function getSetPlaylistIndex(queryClient: ReturnType<typeof useQueryClient>) {
	return async (index: number) => {
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error("trying to change \"playlist\" query, but query doesn't exist yet")
		}
		const newIndex = index < 0
			? playlist.tracks.length - 1
			: index >= playlist.tracks.length
			? 0
			: index
		const current = playlist.tracks[newIndex]!.id
		queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			current,
		})
		await modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
			...meta,
			current,
		}))
	}
}

function getNextPlaylistIndex(queryClient: ReturnType<typeof useQueryClient>) {
	return async (audio: RefObject<HTMLAudioElement>) => {
		const repeatType = repeat.getValue(queryClient)
		if (repeatType === 2) {
			if (audio.current) {
				audio.current.currentTime = 0
				audio.current.play()
			}
			return true
		}
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error("trying to change \"playlist\" query, but query doesn't exist yet")
		}
		const index = playlist.current
			? playlist.order.indexOf(playlist.current)
			: -1

		const newIndex = await (async () => {
			if (repeatType === 0 && index >= playlist.tracks.length - 1) {
				return null
			}
			if (globalWsClient.wsClient?.serverState === false) {
				const nextId = await findFirstCachedTrack({
					from: index + 1,
					tracks: playlist.order,
					loop: repeatType === 1,
				})
				if (!nextId) {
					return null
				}
				return playlist.order.indexOf(nextId)
			}
			if (index >= playlist.tracks.length - 1) {
				return 0
			}
			return index + 1
		})()
		
		if (newIndex === null) {
			return false
		}
		
		const current = playlist.order[newIndex]!
		
		const newOrder = newIndex === playlist.tracks.length - 1 && shuffle.getValue(queryClient)
			? [current, ...shuffleArray(playlist.order.filter(id => id !== current))]
			: playlist.order

		queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			order: newOrder,
			current,
		})
		modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
			...meta,
			order: newOrder,
			current,
		}))

		return true
	}
}

function getPrevPlaylistIndex(queryClient: ReturnType<typeof useQueryClient>) {
	return async () => {
		const playlist = queryClient.getQueryData<Playlist>(["playlist"])
		if (!playlist) {
			throw new Error("trying to change \"playlist\" query, but query doesn't exist yet")
		}
		const index = playlist.current
			? playlist.order.indexOf(playlist.current)
			: -1

		const newIndex = await (async () => {
			if (globalWsClient.wsClient?.serverState === false) {
				const nextId = await findFirstCachedTrack({
					from: index - 1,
					tracks: playlist.order,
					loop: true,
					direction: -1,
				})
				if (!nextId) {
					return null
				}
				return playlist.order.indexOf(nextId)
			}
			if (index <= 0) {
				return playlist.tracks.length - 1
			}
			return index - 1
		})()

		if (newIndex === null) {
			return false
		}

		const current = playlist.order[newIndex]!
		// if "prev" gets us to the last item of the playlist, 
		// AND the playlist is shuffled, 
		// keep the order, but 0 starts at the last index
		// this is to avoid clicking "prev" and listening to a single track before reaching an "invisible" end
		const newOrder = index > 0 || !shuffle.getValue(queryClient) || !playlist.order.length
			? playlist.order
			: [playlist.order.at(-1)!, ...playlist.order.slice(0, playlist.order.length - 1)]
		queryClient.setQueryData<Playlist>(["playlist"], {
			...playlist,
			current,
			order: newOrder,
		})
		modifyInIndexedDB<PlaylistMeta>("appState", "playlist-meta", (meta) => ({
			...meta,
			current,
			order: newOrder,
		}))
	}
}

/**
 * @description changes the current track in the *local* playlist
 */
export function useSetPlaylistIndex() {
	const queryClient = useQueryClient()
	return useMemo(() => ({
		setPlaylistIndex: getSetPlaylistIndex(queryClient),
		nextPlaylistIndex: getNextPlaylistIndex(queryClient),
		prevPlaylistIndex: getPrevPlaylistIndex(queryClient),
	}), [queryClient])
}