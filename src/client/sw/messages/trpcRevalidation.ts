/// <reference lib="webworker" />
import { type AllRoutes, type AllInputs, type RouterInputs } from "utils/trpc"
import { handleTrpcFetchResponse } from "../fetch/trpc"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

const batch: {
	items: {key: AllRoutes, params: AllInputs}[]
	timeoutId: ReturnType<typeof setTimeout> | null
} = {
	items: [],
	timeoutId: null,
}

function processBatch() {
	const items = batch.items
	batch.timeoutId = null
	batch.items = []

	if (items.length === 0) return

	const {endpoints, input} = items.reduce((params, item, i) => {
		params.endpoints.push(item.key.join("."))
		params.input[i] = item.params
			? {json: item.params}
			: {json:null, meta:{values:["undefined"]}}
		return params
	}, {endpoints: [], input: {}} as {endpoints: string[], input: Record<number, any>})

	const url = new URL(`/api/trpc/${endpoints.join(',')}`, self.location.origin)
	url.searchParams.set('batch', '1')
	url.searchParams.set('input', JSON.stringify(input))

	fetch(url).then(async response => {
		if (response.status === 200 || response.status === 207) {
			await handleTrpcFetchResponse(response, url)
			const clients = await self.clients.matchAll()
			clients.forEach(client => {
				items.forEach((payload) =>
					client.postMessage({type: 'sw-trpc-invalidation', payload})
				)
			})
		} else {
			console.warn('SW: failed trpc revalidation', response.status, response.statusText, url)
		}
	})
}

export default function trpcRevalidation<
	TRouteKey extends AllRoutes
>(item: {key: TRouteKey, params: RouterInputs[TRouteKey[0]][TRouteKey[1]]}) {
	batch.items.push(item)
	if (!batch.timeoutId) {
		batch.timeoutId = setTimeout(processBatch, 10)
	}
}