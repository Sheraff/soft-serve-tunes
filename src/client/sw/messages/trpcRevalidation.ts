/// <reference lib="webworker" />
import { type inferHandlerInput } from "@trpc/server"
import { type AppRouter } from "server/router"
import { type TQuery } from "utils/trpc"
import { handleTrpcFetchResponse } from "../fetch/trpc"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

const batch: {
	items: {key: TQuery, params: inferHandlerInput<AppRouter['_def']['queries'][TQuery]>[0]}[]
	timeoutId: ReturnType<typeof setTimeout> | null
} = {
	items: [],
	timeoutId: null,
}

function processBatch() {
	const items = batch.items
	batch.timeoutId = null
	batch.items = []

	const {endpoints, input} = items.reduce((params, item, i) => {
		params.endpoints.push(item.key)
		params.input[i] = item.params
			? {json: item.params}
			: {json:null, meta:{values:["undefined"]}}
		return params
	}, {endpoints: [], input: {}} as {endpoints: string[], input: Record<number, any>})

	const url = new URL(`/api/trpc/${endpoints.join(',')}`, self.location.origin)
	url.searchParams.set('batch', '1')
	url.searchParams.set('input', JSON.stringify(input))

	fetch(url).then(async response => {
		if (response.status === 200) {
			await handleTrpcFetchResponse(response, url)
			const clients = await self.clients.matchAll()
			clients.forEach(client => {
				items.forEach((payload) =>
					client.postMessage({type: 'sw-trpc-invalidation', payload})
				)
			})
		}
	})
}

export default function trpcRevalidation<
	TRouteKey extends TQuery
>(item: {key: TRouteKey, params: inferHandlerInput<AppRouter['_def']['queries'][TRouteKey]>[0]}) {
	batch.items.push(item)
	if (!batch.timeoutId) {
		batch.timeoutId = setTimeout(processBatch, 10)
	}
}