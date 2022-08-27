import { retrieveFromIndexedDB, storeInIndexedDB } from "client/db/utils"
import { atom } from "jotai"

type Serializable =
	| boolean
	| string
	| number
	| null
	| undefined
	| SerializableObject
	| Array<Serializable>

interface SerializableObject {
	[key: string]: Serializable
}

export default function asyncPersistedAtom<T extends Serializable>(
	key: string,
	initial: T,
	parseOnStore: (state: T) => T = (a) => a,
) {
	const baseAtom = atom<T>(initial)

	baseAtom.onMount = (set) => {
		retrieveFromIndexedDB<T>("appState", key)
			.then((value) => {
				if(value)
					set(value)
			})
	}

	const derivedAtom = atom<T, T | ((prev?: T) => T)>(
		(get) => get(baseAtom),
		(get, set, value) => {
			const next = typeof value === 'function'
				? value(get(baseAtom))
				: value
			set(baseAtom, next)
			storeInIndexedDB("appState", key, parseOnStore(next))
		}
	)

	return derivedAtom
}