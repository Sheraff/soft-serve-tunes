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

function joinRoute(key: AllRoutes) {
	return key.join('.') as `${typeof key[0]}.${typeof key[1]}`
}

function processBatch() {
	const items = batch.items
	batch.timeoutId = null
	batch.items = []

	if (items.length === 0) return

	const {endpoints, input} = items.reduce((params, item, i) => {
		params.endpoints.push(joinRoute(item.key))
		params.input[i] = item.params
			? {json: item.params}
			: {json:null, meta:{values:["undefined"]}}
		return params
	}, {endpoints: [], input: {}} as {endpoints: ReturnType<typeof joinRoute>[], input: Record<number, unknown>})

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
	}).catch(() => {
		items.forEach(item => addItemToBatch(item))
	})
}

function isEquivalentItem<
	ARouteKey extends AllRoutes,
	BRouteKey extends AllRoutes,
>(
	a: {key: ARouteKey, params: RouterInputs[ARouteKey[0]][ARouteKey[1]]},
	b: {key: BRouteKey, params: RouterInputs[BRouteKey[0]][BRouteKey[1]]}
) {
	if (a.key[0] !== b.key[0]) return false
	if (a.key[1] !== b.key[1]) return false
	if (a.params === b.params) return true
	if (a.params === undefined || b.params === undefined) return false
	const aKeys = Object.keys(a.params)
	const bKeys = Object.keys(b.params)
	if (aKeys.length !== bKeys.length) return false
	for (let i = 0; i < aKeys.length; i++) {
		const key = aKeys[i]!
		if (a.params[key] !== b.params[key]) return false
	}
	return true
}

function addItemToBatch<
	TRouteKey extends AllRoutes
>(item: {key: TRouteKey, params: RouterInputs[TRouteKey[0]][TRouteKey[1]]}) {
	if (!batch.items.some(i => isEquivalentItem(i, item))) {
		batch.items.push(item)
	}
}

export default function trpcRevalidation<
	TRouteKey extends AllRoutes
>(item: {key: TRouteKey, params: RouterInputs[TRouteKey[0]][TRouteKey[1]]}) {
	addItemToBatch(item)
	if (!batch.timeoutId) {
		batch.timeoutId = setTimeout(processBatch, 10)
	}
}