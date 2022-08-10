import { useEffect, useRef } from "react"
import { useQueryClient, UseQueryResult } from "react-query"
import { retrieveQueryFromIndexedDB, storeQueryInIndexedDB } from "./trpc"
import { inferQueryOutput, inferUseTRPCQueryOptions, trpc } from "../../utils/trpc"
import type { inferHandlerInput } from "@trpc/server"
import type { AppRouter } from "../../server/router"

type TQuery = keyof AppRouter["_def"]["queries"];

type TPathAndArgs<TRouteKey extends TQuery> = [
	path: TRouteKey,
	...args: inferHandlerInput<AppRouter['_def']['queries'][TRouteKey]>
]

export default function useIndexedTRcpQuery<
	TRouteKey extends TQuery
>(
	pathAndInput: TPathAndArgs<TRouteKey>,
	options: inferUseTRPCQueryOptions<TRouteKey> = {}
): UseQueryResult<inferQueryOutput<TRouteKey>> {
	const state = useRef('idle')
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