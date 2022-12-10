/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

export async function messageCheckTrackCache({id}: {id: string}, {source}: ExtendableMessageEvent) {
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

export async function messageCheckFirstCachedTrack({
	params,
	id
}: {
	params: {
		from: number,
		loop: boolean,
		tracks: string[],
	},
	id: string
}, {
	source
}: ExtendableMessageEvent
) {
	if (!source) return
	const cache = await caches.open(CACHES.media)
	let next = null
	const max = params.loop
		? params.from + params.tracks.length
		: params.tracks.length
	for (let i = params.from; i < max; i++) {
		const track = params.tracks[i % params.tracks.length]!
		const cached = await cache.match(new URL(`/api/file/${track}`, self.location.origin), {
			ignoreVary: true,
			ignoreSearch: true,
		})
		if (cached) {
			next = track
			break
		}
	}
	console.log('offline find first cached track, found next track', next, params.from, params.loop, params.tracks)
	source.postMessage({type: 'sw-first-cached-track', payload: {
		id,
		next,
	}})
}