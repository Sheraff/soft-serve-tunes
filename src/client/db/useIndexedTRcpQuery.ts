import { useEffect, useRef, useState } from "react"
import { useQueryClient, UseQueryResult } from "react-query"
import { retrieveQueryFromIndexedDB, storeQueryInIndexedDB } from "./trpc"
import { inferQueryOutput, inferUseTRPCQueryOptions, trpc } from "utils/trpc"
import type { inferHandlerInput } from "@trpc/server"
import type { AppRouter } from "server/router"

type TQuery = keyof AppRouter["_def"]["queries"];

type TPathAndArgs<TRouteKey extends TQuery> = [
	path: TRouteKey,
	...args: inferHandlerInput<AppRouter['_def']['queries'][TRouteKey]>
]

export default trpc.useQuery

function useIndexedTRcpQuery<
	TRouteKey extends TQuery
>(
	pathAndInput: TPathAndArgs<TRouteKey>,
	options: inferUseTRPCQueryOptions<TRouteKey> = {}
): UseQueryResult<inferQueryOutput<TRouteKey>> {
	const queryClient = useQueryClient()

	const [defaultEnabled, setDefaultEnabled] = useState(() => {
		const queryState = queryClient.getQueryState<TPathAndArgs<TRouteKey>>(pathAndInput)
		return queryState?.status === 'success' ? options.enabled : false
	})
	const isFromIndexed = useRef(false)
	const noModeIndexed = useRef(false)

	const refetch = useRef<UseQueryResult<inferQueryOutput<TRouteKey>>['refetch'] | null>(null)
	const queryResponse = trpc.useQuery(pathAndInput, {
		...options,
		enabled: options.enabled === false ? false : defaultEnabled,
		onSuccess(data) {
			options.onSuccess?.(data)
			if (!isFromIndexed.current) {
				requestIdleCallback(() => {
					storeQueryInIndexedDB<inferQueryOutput<TRouteKey>>(pathAndInput, data)
				})
			} else if (!data) {
				refetch.current?.()
			} else {
				requestIdleCallback(() => {
					// TODO: only if network is good
					refetch.current?.()
				})
			}
			isFromIndexed.current = false
		}
	})
	refetch.current = queryResponse.refetch

	const keyPath = JSON.stringify(pathAndInput)
	useEffect(() => {
		if (options.enabled === false || noModeIndexed.current) return
		const extracted = JSON.parse(keyPath) as TPathAndArgs<TRouteKey>
		queryClient.fetchQuery<TPathAndArgs<TRouteKey>>(extracted, async () => {
			noModeIndexed.current = true
			const data = await retrieveQueryFromIndexedDB<inferQueryOutput<TRouteKey>>(keyPath)
			isFromIndexed.current = true
			if (data) {
				return data
			} else {
				setDefaultEnabled(true)
			}
		})
	}, [queryResponse.isFetched, queryClient, keyPath, options.enabled])

	return queryResponse
}