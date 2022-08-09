import { useEffect, useRef } from "react"
import { useQueryClient, UseQueryResult } from "react-query"
import { retrieveQueryFromIndexedDB, storeQueryInIndexedDB } from "./trpc"
import { inferQueryInput, inferQueryOutput, inferUseTRPCQueryOptions, TQuery, trpc } from "../../utils/trpc"

export default function useIndexedTRcpQuery<
	TRouteKey extends TQuery
>(
	pathAndInput: inferQueryInput<TRouteKey> extends (undefined | void | null)
		? [TRouteKey]
		: [TRouteKey, inferQueryInput<TRouteKey>],
	options: inferUseTRPCQueryOptions<TRouteKey> = {}
): UseQueryResult<inferQueryOutput<TRouteKey>> {
	const state = useRef('idle')
	//@ts-ignore -- it somehow expects a 2-tuple but some queries don't have an input
	const queryResponse = trpc.useQuery(pathAndInput, {
		...options,
		onSuccess(data) {
			options.onSuccess?.(data)
			if (options.enabled ?? true) {
				state.current = 'done'
				storeQueryInIndexedDB<inferQueryOutput<TRouteKey>>(pathAndInput, data)
			}
		}
	})
	const queryClient = useQueryClient()
	const lastFetched = useRef<string>()
	const keyPath = JSON.stringify(pathAndInput)
	useEffect(() => {
		if (keyPath === lastFetched.current) return
		state.current = 'loading'
		lastFetched.current = keyPath
		retrieveQueryFromIndexedDB<inferQueryOutput<TRouteKey>>(keyPath).then(data => {
			if (state.current === 'loading' && lastFetched.current === keyPath) {
				const extracted = JSON.parse(keyPath)
				queryClient.setQueryData(extracted, data)
				queryClient.invalidateQueries(extracted)
			}
		})
	}, [queryResponse.isFetched, queryClient, keyPath])

	return queryResponse
}