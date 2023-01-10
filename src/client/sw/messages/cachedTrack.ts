/// <reference lib="webworker" />
import { CACHES } from "../utils/constants"

export async function messageCheckTrackCache({id}: {id: string}, {source}: ExtendableMessageEvent) {
	if (!source) return
	const cache = await caches.match(new URL(`/api/file/${id}`, self.location.origin), {
		ignoreVary: true,
		ignoreSearch: true,
		cacheName: CACHES.media,
	})
	source.postMessage({type: "sw-cached-track", payload: {
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
		direction?: 1 | -1,
	},
	id: string
}, {
	source
}: ExtendableMessageEvent
) {
	if (!source) return
	const cache = await caches.open(CACHES.media)
	let next = null
	const reverse = params.direction === -1
	const max = reverse
		? params.loop
			? params.from - params.tracks.length
			: -1
		: params.loop
			? params.from + params.tracks.length
			: params.tracks.length
	for (
		let i = params.from;
		reverse ? i > max : i < max;
		reverse ? i-- : i++
	) {
		const track = params.tracks[(i + params.tracks.length) % params.tracks.length]!
		const cached = await cache.match(new URL(`/api/file/${track}`, self.location.origin), {
			ignoreVary: true,
			ignoreSearch: true,
		})
		if (cached) {
			next = track
			break
		}
	}
	source.postMessage({type: "sw-first-cached-track", payload: {
		id,
		next,
	}})
}