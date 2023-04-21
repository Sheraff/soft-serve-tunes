import { useQuery } from "@tanstack/react-query"
import { retrieveFromIndexedDB, storeInIndexedDB } from "client/db/utils"
import { queryClient } from "utils/trpc"

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


function useAtomAppValue<T extends Serializable> (key: string, initial: T) {
	const { data } = useQuery([PERSISTED_ATOM_KEY, key], {
		async queryFn () {
			const stored = await retrieveFromIndexedDB<T>("appState", key)
			return stored ?? initial
		},
		keepPreviousData: true,
		suspense: true,
		cacheTime: Infinity,
		staleTime: Infinity,
		networkMode: "offlineFirst",
	})
	return data!
}

function setAtomAppState<T extends Serializable> (key: string, value: T | ((prev?: T) => T)) {
	const next = queryClient.setQueryData<T>([PERSISTED_ATOM_KEY, key], value)
	storeInIndexedDB<T>("appState", key, next!)
}

function getAtomAppValue<T extends Serializable> (key: string) {
	return queryClient.getQueryData<T>([PERSISTED_ATOM_KEY, key])!
}

function useAtomAppState<T extends Serializable> (key: string, initial: T) {
	return [
		useAtomAppValue<T>(key, initial),
		(value: T | ((prev?: T) => T)) => setAtomAppState<T>(key, value),
	] as const
}

export default function suspensePersistedState<T extends Serializable> (key: string, initial: T) {
	return {
		useValue: () => useAtomAppValue<T>(key, initial),
		getValue: () => getAtomAppValue<T>(key),
		setState: (value: T | ((prev?: T) => T)) => setAtomAppState<T>(key, value),
		useState: () => useAtomAppState<T>(key, initial),
	}
}
