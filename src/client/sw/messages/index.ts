/// <reference lib="webworker" />
import { retryPostOnOnline } from "../fetch/trpcPost"
import { messageCheckAlbumCache, messageListAlbumCache } from "./cachedAlbum"
import { messageCheckArtistCache, messageListArtistCache } from "./cachedArtist"
import { messageCheckTrackCache, messageCheckFirstCachedTrack, messageListTrackCache } from "./cachedTrack"
import { messageCheckPlaylistCache, messageListPlaylistCache } from "./cachedPlaylist"
import { messageCheckGenreCache, messageListGenreCache } from "./cachedGenre"
import trpcRevalidation from "./trpcRevalidation"
import { cleanupCache, pauseCacheCleanup } from "./cleanupCache"
import { getServerIp } from "client/sw/network/localClient"

export default function onMessage (event: ExtendableMessageEvent) {
	switch (event.data.type) {
		case "sw-cached-track":
			return messageCheckTrackCache(event.data.payload, event)
		case "sw-first-cached-track":
			return messageCheckFirstCachedTrack(event.data.payload, event)
		case "sw-cached-track-list":
			return messageListTrackCache(event)
		case "sw-cached-album":
			return messageCheckAlbumCache(event.data.payload, event)
		case "sw-cached-album-list":
			return messageListAlbumCache(event)
		case "sw-cached-artist":
			return messageCheckArtistCache(event.data.payload, event)
		case "sw-cached-artist-list":
			return messageListArtistCache(event)
		case "sw-cached-playlist":
			return messageCheckPlaylistCache(event.data.payload, event)
		case "sw-cached-playlist-list":
			return messageListPlaylistCache(event)
		case "sw-cached-genre":
			return messageCheckGenreCache(event.data.payload, event)
		case "sw-cached-genre-list":
			return messageListGenreCache(event)
		case "sw-trpc-revalidate":
			return trpcRevalidation(event.data.payload)
		case "sw-trpc-offline-post":
			return retryPostOnOnline()
		case "sw-app-blur":
			return cleanupCache()
		case "sw-app-focus": {
			getServerIp(event.data.payload)
			pauseCacheCleanup()
			return
		}
		default:
			console.error(new Error(`SW: unknown message type: ${event.data.type}`))
	}
}

