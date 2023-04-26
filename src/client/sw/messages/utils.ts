/// <reference lib="webworker" />
import {
	type RouteKey,
	type RouterInputs,
	type SecondRouteKey,
	type AllRoutesString,
} from "utils/trpc"

export function trpcQueryToCacheKey<
	A extends RouteKey,
	B extends SecondRouteKey<A>,
> (endpoint: `${A}.${B}` & AllRoutesString, json: RouterInputs[A][B]) {
	const url = new URL(`/api/trpc/${endpoint}`, self.location.origin)
	if (json) url.searchParams.set("input", JSON.stringify({ json }))
	return url
}