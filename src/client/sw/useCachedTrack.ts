import { useQuery } from "react-query"

export default function useCachedTrack({id, enabled}: {id?: string, enabled?: boolean}) {
	const query = useQuery({
		enabled: Boolean(id) && enabled !== false,
		queryKey: ['sw-cached-track', id],
		queryFn({ signal }) {
			const controller = new AbortController()
			signal.onabort = () => controller.abort()
			return new Promise(async (resolve, reject) => {
				const registration = await navigator.serviceWorker.ready
				const target = registration.active
				if (!target) {
					return reject(new Error('no active SW registration'))
				}
				navigator.serviceWorker.addEventListener("message", (event) => {
					const message = event.data
					if (message.type === 'sw-cached-track' && message.payload.id === id) {
						resolve(message.payload.cached)
						controller.abort()
					}
				}, {signal: controller.signal})
				target.postMessage({type: 'sw-cached-track', payload: {id}})
				controller.signal.onabort = () => reject(new Error('stale SW query'))
			})
		},
	})
	return query
}