import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import { type TQuery } from "utils/trpc"

export default async function revalidateSwCache<
	TRouteKey extends TQuery
>(key: TRouteKey, params?: inferHandlerInput<AppRouter['_def']['queries'][TRouteKey]>[0]) {
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