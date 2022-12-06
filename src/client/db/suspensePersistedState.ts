import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"
import { retrieveFromIndexedDB, storeInIndexedDB } from "client/db/utils"

type Serializable =
	| boolean
	| string
	| number
	| null
	| undefined
	| SerializableObject
	| Array<Serializable>

type SerializableObject = {
	[key: string]: Serializable
}

const PERSISTED_ATOM_KEY = "persisted-atom"


function useAtomAppValue<T extends Serializable>(key: string, initial: T) {
	const {data} = useQuery([PERSISTED_ATOM_KEY, key], {
		async queryFn() {
			const stored = await retrieveFromIndexedDB<T>("appState", key)
			return stored ?? initial
		},
		keepPreviousData: true,
		suspense: true,
		cacheTime: Infinity,
		staleTime: Infinity,
	})
	return data!
}

function setAtomAppState<T extends Serializable>(key: string, value: T | ((prev?: T) => T), queryClient: QueryClient) {
	const next = queryClient.setQueryData<T>([PERSISTED_ATOM_KEY, key], value)
	storeInIndexedDB<T>("appState", key, next!)
}

function getAtomAppValue<T extends Serializable>(key: string, queryClient: QueryClient) {
	return queryClient.getQueryData<T>([PERSISTED_ATOM_KEY, key])!
}

function useAtomAppState<T extends Serializable>(key: string, initial: T) {
	const queryClient = useQueryClient()
	return [
		useAtomAppValue<T>(key, initial),
		(value: T | ((prev?: T) => T)) => setAtomAppState<T>(key, value, queryClient),
	] as const
}

export default function suspensePersistedState<T extends Serializable>(key: string, initial: T) {
	return {
		useValue: () => useAtomAppValue<T>(key, initial),
		getValue: (queryClient: QueryClient) => getAtomAppValue<T>(key, queryClient),
		setState: (value: T | ((prev?: T) => T), queryClient: QueryClient) => setAtomAppState<T>(key, value, queryClient),
		useState: () => useAtomAppState<T>(key, initial),
	}
}
