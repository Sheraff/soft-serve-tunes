/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

export default async function messageCheckTrackCache({id}: {id: string}, {source}: ExtendableMessageEvent) {
	if (!source) return
	const cache = await caches.match(new URL(`/api/file/${id}`, self.location.origin), {
		ignoreVary: true,
		ignoreSearch: true,
		cacheName: CACHES.media,
	})
	source.postMessage({type: 'sw-cached-track', payload: {
		id,
		cached: Boolean(cache),
	}})
}