let dbPromise: Promise<IDBDatabase> | null = null

const DB_NAME = "soft-serve-tunes"
const DB_VERSION = 1
type Stores = "requests" | "palette"

export function openDB(): Promise<IDBDatabase> {
	if (dbPromise)
		return dbPromise
	const promise = new Promise<IDBDatabase>(async (resolve, reject) => {
		const openRequest = await indexedDB.open(DB_NAME, DB_VERSION)
		openRequest.onupgradeneeded = (event) => onUpgradeNeeded(event, reject)
		openRequest.onsuccess = () => {
			resolve(openRequest.result)
		}
		openRequest.onerror = () => {
			console.error(`failed to open db`, openRequest.error?.message)
			reject(openRequest.error)
			dbPromise = null
		}
	})
	dbPromise = promise
	return promise
}

function onUpgradeNeeded(
	event: IDBVersionChangeEvent,
	reject: (reason?: any) => void
) {
	const db = event.target.result
	db.onerror = () => {
		console.error(`failed to upgrade db`, db.error?.message)
		reject(db.error)
		dbPromise = null
	}

	db.createObjectStore("requests", {keyPath: "key"})
	db.createObjectStore("palette", {keyPath: "key"})
}

type QueryStorage<T> = {
	key: string,
	result: T,
}

export async function retrieveFromIndexedDB<T>(storeName: Stores, key: string): Promise<T | null> {
	const db = await openDB()
	const tx = db.transaction(storeName)
	const store = tx.objectStore(storeName)
	const request = store.get(key) as IDBRequest<QueryStorage<T>>
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(`failed to retrieve entity ${key} from indexedDB`, request.error?.message)
			reject(request.error)
		}
		request.onsuccess = () => {
			const result = request.result?.result
			if (result) {
				resolve(result)
			} else {
				resolve(null)
			}
		}
	})
}

export async function storeInIndexedDB<T>(storeName: Stores, key: string, result: T) {
	const db = await openDB()
	const tx = db.transaction(storeName, "readwrite")
	const store = tx.objectStore(storeName)
	const request = store.put({
		key,
		result,
	})
	request.onerror = () => {
		console.error(`failed to store entity ${key} in indexedDB`, request.error?.message)
	}
}