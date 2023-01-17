import { useQuery } from "@tanstack/react-query"

type SWQueryEvent =
	| "sw-cached-track"
	| "sw-cached-album"
	| "sw-cached-artist"

type SWQueryPayload = {
	id?: string,
	enabled?: boolean,
}

function useSWQuery(type: SWQueryEvent, {id, enabled}: SWQueryPayload) {
	return useQuery({
		enabled: Boolean(id) && enabled !== false,
		queryKey: [type, id],
		queryFn({ signal }) {
			if (!("serviceWorker" in navigator)) return false
			if (!id) return false
			const controller = new AbortController()
			// signal will always be defined on browsers that support it, and I only care about modern browsers
			signal!.onabort = () => controller.abort()
			return new Promise<boolean>(async (resolve, reject) => {
				const registration = await navigator.serviceWorker.ready
				const target = registration.active
				if (!target) {
					return reject(new Error("no active SW registration"))
				}
				navigator.serviceWorker.addEventListener("message", (event) => {
					const message = event.data
					if (message.type === type && message.payload.id === id) {
						resolve(message.payload.cached)
						controller.abort()
					}
				}, {signal: controller.signal})
				target.postMessage({type, payload: {id}})
				controller.signal.onabort = () => reject(new Error("stale SW query"))
			})
		},
		staleTime: 60_000,
		cacheTime: Infinity,
		networkMode: "offlineFirst",
	})
}

export function useCachedTrack(params: SWQueryPayload) {
	return useSWQuery("sw-cached-track", params)
}

export function useCachedAlbum(params: SWQueryPayload) {
	return useSWQuery("sw-cached-album", params)
}

export function useCachedArtist(params: SWQueryPayload) {
	return useSWQuery("sw-cached-artist", params)
}

export async function findFirstCachedTrack(
	params: {
		from: number,
		loop: boolean,
		tracks: string[],
		direction?: 1 | -1,
	},
	signal?: AbortSignal
) {
	if (!("serviceWorker" in navigator)) return null
	const controller = new AbortController()
	if (signal) {
		signal.onabort = () => controller.abort()
	}
	const found = await new Promise<string | null>(async (resolve, reject) => {
		const id = Math.random().toString(36).slice(2)
		const registration = await navigator.serviceWorker.ready
		const target = registration.active
		if (!target) {
			return reject(new Error("no active SW registration"))
		}
		navigator.serviceWorker.addEventListener("message", (event) => {
			const message = event.data
			if (message.type === "sw-first-cached-track" && message.payload.id === id) {
				resolve(message.payload.next as string | null)
				controller.abort()
			}
		} , {signal: controller.signal})
		target.postMessage({type: "sw-first-cached-track", payload: {params, id}})
		controller.signal.onabort = () => reject(new Error("stale SW query"))
	})
	return found
}

export function useNextCachedTrack(params: {
	tracks: string[],
	enabled?: boolean,
	from: number,
	loop: boolean,
	direction?: 1 | -1,
}) {
	const query = useQuery({
		enabled: params.tracks.length > 0 && params.enabled !== false,
		queryKey: ["sw-first-cached-track", params],
		queryFn({ signal }) {
			return findFirstCachedTrack(params, signal)
		},
		networkMode: "offlineFirst",
	})
	return query
}