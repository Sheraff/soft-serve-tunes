import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"

const SESSION_ATOM_KEY = "session-atom"

const global: Record<string, unknown> = {}

function useAtomValue<T>(key: string, initial: T) {
	const { data } = useQuery([SESSION_ATOM_KEY, key], {
		initialData: initial,
		keepPreviousData: true,
		cacheTime: Infinity,
		staleTime: Infinity,
		networkMode: "offlineFirst",
	})
	return data
}

function setAtomValue<T>(key: string, value: T | ((prev: T) => T), queryClient: QueryClient, sideEffects?: (value: T, queryClient: QueryClient) => void) {
	const next = queryClient.setQueryData<T>([SESSION_ATOM_KEY, key], value as T | ((prev?: T) => T))
	global[key] = next
	if (sideEffects) {
		sideEffects(next!, queryClient)
	}
}

function useAtomState<T>(key: string, initial: T, sideEffects?: (value: T, queryClient: QueryClient) => void) {
	const queryClient = useQueryClient()
	return [
		useAtomValue<T>(key, initial),
		(value: T | ((prev: T) => T)) => setAtomValue<T>(key, value, queryClient, sideEffects),
	] as const
}

function getAtomValue<T>(key: string, queryClient: QueryClient) {
	if (key in global) return global[key] as T
	return queryClient.getQueryData<T>([SESSION_ATOM_KEY, key])!
}

export default function globalState<T>(key: string, initial: T, sideEffects?: (value: T, queryClient: QueryClient) => void) {
	global[key] = initial
	return {
		useValue: () => useAtomValue<T>(key, initial),
		setState: (value: T | ((prev: T) => T), queryClient: QueryClient) => setAtomValue<T>(key, value, queryClient, sideEffects),
		useState: () => useAtomState<T>(key, initial, sideEffects),
		getValue: (queryClient: QueryClient) => getAtomValue<T>(key, queryClient),
	}
}