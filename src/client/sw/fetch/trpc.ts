/// <reference lib="webworker" />
import { AllRoutesString, keyStringToArray } from "utils/trpc"
import trpcRevalidation from "../messages/trpcRevalidation"
import { CACHES } from "../utils/constants"
import { addToBatch } from "client/sw/trpc/batch"
import { deserialize } from "superjson"

async function trpcUrlCacheOrBatch(url: URL): Promise<Response> {
	const cache = await caches.open(CACHES.trpc)
	const cachedResponse = await cache.match(url)

	if (cachedResponse) {
		setTimeout(() => {
			const endpoint = url.pathname.split("/")[3]! as AllRoutesString
			const input = url.searchParams.get("input")!
			const params = deserialize(JSON.parse(input))
			trpcRevalidation({ key: keyStringToArray(endpoint), params })
		}, 1_000)
		return cachedResponse
	}

	const endpoint = url.pathname.split("/")[3]!
	const input = url.searchParams.get("input")!
	return addToBatch(endpoint, input, false)
		.then((body) => new Response(body))
}

export default function trpcFetch(event: FetchEvent, url: URL) {
	event.respondWith(
		trpcUrlCacheOrBatch(url)
	)
}