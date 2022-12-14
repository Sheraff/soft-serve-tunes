let dbPromise: Promise<IDBDatabase> | null = null

const DB_NAME = "soft-serve-tunes"
const DB_VERSION = 4
type Stores = "pastSearches" | "appState" | "playlist"

export function openDB(): Promise<IDBDatabase> {
	if (dbPromise)
		return dbPromise
	const promise = new Promise<IDBDatabase>(async (resolve, reject) => {
		const openRequest = await indexedDB.open(DB_NAME, DB_VERSION)
		openRequest.onupgradeneeded = (event) => onUpgradeNeeded(
			event as Parameters<typeof onUpgradeNeeded>[0],
			reject
		)
		openRequest.onsuccess = () => {
			resolve(openRequest.result)
		}
		openRequest.onerror = () => {
			console.error(new Error("failed to open db", {cause: openRequest.error}))
			reject(openRequest.error)
			dbPromise = null
		}
	})
	dbPromise = promise
	return promise
}

function onUpgradeNeeded(
	event: IDBVersionChangeEvent & {target: {result: IDBDatabase}},
	reject: (reason?: Error) => void
) {
	const db = event.target.result
	db.onerror = () => {
		const dbWithError = db as IDBDatabase & {error: Error}
		console.error(new Error("failed to upgrade db", {cause: dbWithError.error}))
		reject(dbWithError.error)
		dbPromise = null
	}

	if (event.oldVersion < 1) {
		db.createObjectStore("pastSearches", {keyPath: "key"})
	}
	if (event.oldVersion < 2) {
		db.createObjectStore("appState", {keyPath: "key"})
	}
	if (event.oldVersion < 3) {
		if (db.objectStoreNames.contains("requests")) {
			db.deleteObjectStore("requests")
		}
	}
	if (event.oldVersion < 4) {
		db.createObjectStore("playlist", {keyPath: "key"})
	}
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
			console.error(new Error(`failed to retrieve entity ${key} from indexedDB`, {cause: request.error}))
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

export async function countFromIndexedDB(storeName: Stores): Promise<number> {
	const db = await openDB()
	const tx = db.transaction(storeName)
	const store = tx.objectStore(storeName)
	const request = store.count()
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(new Error(`failed to count rows from indexedDB ${storeName}`, {cause: request.error}))
			reject(request.error)
		}
		request.onsuccess = () => resolve(request.result)
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
		console.error(new Error(`failed to store entity ${key} in indexedDB`, {cause: request.error}))
	}
}

export async function modifyInIndexedDB<T>(storeName: Stores, key: string, mutate: (result: T) => T) {
	const db = await openDB()
	const tx = db.transaction(storeName, "readwrite")
	const store = tx.objectStore(storeName)
	return new Promise((resolve, reject) => {
		tx.onerror = () => {
			console.error(new Error(`failed to modify entity ${key} from indexedDB`, {cause: tx.error}))
			reject(tx.error)
		}
		tx.oncomplete = resolve
		
		const getRequest = store.get(key) as IDBRequest<QueryStorage<T>>
		getRequest.onsuccess = () => {
			const result = getRequest.result?.result
			if (!result) {
				const reason = `no record to modify found for entity ${key}`
				console.error(reason)
				return reject(reason)
			}
			const newResult = mutate(result)
			const putRequest = store.put({
				key,
				result: newResult,
			})
			putRequest.onsuccess = resolve
			putRequest.onerror = reject
		}
	})
}

export async function storeListInIndexedDB<T>(storeName: Stores, items: {key: string, result: T}[]) {
	const db = await openDB()
	const tx = db.transaction(storeName, "readwrite")
	const store = tx.objectStore(storeName)
	items.forEach(item => store.put(item))
	return new Promise((resolve, reject) => {
		tx.onerror = () => {
			console.error(new Error(`failed to add many items in indexedDB ${storeName}`, {cause: tx.error}))
			reject(tx.error)
		}
		tx.oncomplete = resolve
	})
}

export async function listAllFromIndexedDB<T>(storeName: Stores): Promise<T[]> {
	const db = await openDB()
	const tx = db.transaction(storeName)
	const store = tx.objectStore(storeName)
	const request = store.getAll() as IDBRequest<QueryStorage<T>[]>
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(new Error(`failed to retrieve entities from indexedDB ${storeName}`, {cause: request.error}))
			reject(request.error)
		}
		request.onsuccess = () => {
			const result = request.result?.map(({result}) => result)
			if (result) {
				resolve(result)
			} else {
				resolve([])
			}
		}
	})
}

export async function deleteFromIndexedDB(storeName: Stores, key: string) {
	const db = await openDB()
	const tx = db.transaction(storeName, "readwrite")
	const store = tx.objectStore(storeName)
	const request = store.delete(key)
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(new Error(`failed to delete entity ${key} from indexedDB ${storeName}`, {cause: request.error}))
			reject(request.error)
		}
		request.onsuccess = resolve
	})
}

export async function deleteAllFromIndexedDB(storeName: Stores) {
	const db = await openDB()
	const tx = db.transaction(storeName, "readwrite")
	const store = tx.objectStore(storeName)
	const request = store.clear()
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(new Error(`failed to clear store ${storeName} from indexedDB`, {cause: request.error}))
			reject(request.error)
		}
		request.onsuccess = resolve
	})
}