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
		onSuccess(data, ...rest) {
			if (options.enabled ?? true) {
				state.current = 'done'
				storeQueryInIndexedDB<inferQueryOutput<TRouteKey>>(pathAndInput, data)
			}
			options.onSuccess?.(data, ...rest)
		}
	})
	const queryClient = useQueryClient()
	useEffect(() => {
		if (queryResponse.isFetched || state.current !== 'idle') return
		state.current = 'loading'
		retrieveQueryFromIndexedDB<inferQueryOutput<TRouteKey>>(pathAndInput).then(data => {
			if (state.current === 'loading') {
				queryClient.setQueryData(pathAndInput, data)
				queryClient.invalidateQueries(pathAndInput)
			}
		})
	}, [queryResponse.isFetched, queryClient, pathAndInput])

	return queryResponse
}