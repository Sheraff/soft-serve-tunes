/// <reference lib="webworker" />
import { CACHES } from "client/sw/utils/constants"
import {
	type RouteKey,
	type RouterInputs,
	type SecondRouteKey,
	type AllRoutesString,
	type TrpcResponse,
	type RouterOutputs,
} from "utils/trpc"

// export function trpcQueryToCacheKey<
// 	A extends RouteKey,
// 	B extends SecondRouteKey<A>,
// > (endpoint: `${A}.${B}` & AllRoutesString, json: RouterInputs[A][B]) {
// 	const url = new URL(`/api/trpc/${endpoint}`, self.location.origin)
// 	if (json) url.searchParams.set("input", JSON.stringify({ json }))
// 	return url
// }

export function cacheMatchTrpcQuery<
	A extends RouteKey,
	B extends SecondRouteKey<A>,
> (endpoint: `${A}.${B}` & AllRoutesString, json?: RouterInputs[A][B]) {
	const url = new URL(`/api/trpc/${endpoint}`, self.location.origin)
	if (json) url.searchParams.set("input", JSON.stringify({ json }))

	const params: MultiCacheQueryOptions = {
		ignoreVary: true,
		ignoreSearch: false,
		cacheName: CACHES.trpc,
	}

	return caches.match(url, params) as Promise<undefined | (Omit<Response, "json"> & {
		json (): Promise<TrpcResponse<RouterOutputs[A][B]>>
	})>
}