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

declare global {
	interface Window {
		readonly __PERSISTED_ATOMS__: {
			[key: string]: any
		}
	}
}
if (typeof window !== 'undefined') {
	// @ts-expect-error -- this is the initial declaration of a readonly
	window.__PERSISTED_ATOMS__ = {}
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
				if(value) {
					set(value)
					window.__PERSISTED_ATOMS__[key] = value
				}
			})
	}

	const derivedAtom = atom<T, T | ((prev: T) => T)>(
		(get) => get(baseAtom),
		(get, set, value) => {
			const next = typeof value === 'function'
				? value(get(baseAtom))
				: value
			set(baseAtom, next)
			storeInIndexedDB("appState", key, parseOnStore(next))
			window.__PERSISTED_ATOMS__[key] = value
		}
	)

	const extra = {
		key,
		getValue: () => window.__PERSISTED_ATOMS__[key] as T
	}

	return Object.assign(derivedAtom, extra) as (typeof derivedAtom) & (typeof extra)
}