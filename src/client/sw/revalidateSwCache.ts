import { type AllRoutes, type RouterInputs } from "utils/trpc"

export default async function revalidateSwCache<
	TRouteKey extends AllRoutes
>(key: TRouteKey, params?: RouterInputs[TRouteKey[0]][TRouteKey[1]]) {
	const registration = await navigator.serviceWorker.ready
	if (!registration.active) return
	registration.active.postMessage({
		type: 'sw-trpc-revalidate',
		payload: {
			key,
			params,
		}
	})
}