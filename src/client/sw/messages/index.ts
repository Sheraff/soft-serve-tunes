/// <reference lib="webworker" />
import messageCheckTrackCache from "./cachedTrack"
import trpcRevalidation from "./trpcRevalidation"

export default function onMessage(event: ExtendableMessageEvent) {
	switch (event.data.type) {
		case 'sw-cached-track':
			return messageCheckTrackCache(event.data.payload, event)
		case 'sw-trpc-revalidate':
			return trpcRevalidation(event.data.payload)
		default:
			console.error(new Error(`SW: unknown message type: ${event.data.type}`))
	}
}