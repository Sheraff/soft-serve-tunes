/// <reference lib="webworker" />
import messageCheckTrackCache from "./cachedTrack"

export default function onMessage(event: ExtendableMessageEvent) {
	switch (event.data.type) {
		case 'sw-cached-track':
			return messageCheckTrackCache(event.data.payload, event)
		default:
			console.error(new Error(`SW: unknown message type: ${event.data.type}`))
	}
}