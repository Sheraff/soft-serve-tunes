/// <reference lib="webworker" />
import { retryPostOnOnline } from "../fetch/trpcPost"
import { messageCheckTrackCache, messageCheckFirstCachedTrack } from "./cachedTrack"
import trpcRevalidation from "./trpcRevalidation"

export default function onMessage(event: ExtendableMessageEvent) {
	switch (event.data.type) {
		case 'sw-cached-track':
			return messageCheckTrackCache(event.data.payload, event)
		case 'sw-first-cached-track':
			return messageCheckFirstCachedTrack(event.data.payload, event)
		case 'sw-trpc-revalidate':
			return trpcRevalidation(event.data.payload)
		case 'sw-trpc-offline-post':
			return retryPostOnOnline()
		default:
			console.error(new Error(`SW: unknown message type: ${event.data.type}`))
	}
}