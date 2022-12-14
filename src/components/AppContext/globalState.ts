import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"

const SESSION_ATOM_KEY = "session-atom"

function useAtomValue<T>(key: string, initial: T) {
	const { data } = useQuery([SESSION_ATOM_KEY, key], {
		initialData: initial,
		keepPreviousData: true,
		cacheTime: Infinity,
		staleTime: Infinity,
	})
	return data
}

function setAtomValue<T>(key: string, value: T | ((prev: T) => T), queryClient: QueryClient, sideEffects?: (value: T, queryClient: QueryClient) => void) {
	const next = queryClient.setQueryData<T>([SESSION_ATOM_KEY, key], value as T | ((prev?: T) => T))
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
	return queryClient.getQueryData<T>([SESSION_ATOM_KEY, key])!
}

export default function globalState<T>(key: string, initial: T, sideEffects?: (value: T, queryClient: QueryClient) => void) {
	return {
		useValue: () => useAtomValue<T>(key, initial),
		setState: (value: T | ((prev: T) => T), queryClient: QueryClient) => setAtomValue<T>(key, value, queryClient, sideEffects),
		useState: () => useAtomState<T>(key, initial, sideEffects),
		getValue: (queryClient: QueryClient) => getAtomValue<T>(key, queryClient),
	}
}