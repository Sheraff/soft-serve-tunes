const dbPromises: {[name: string]: Promise<IDBDatabase> | null} = {}

function openDB(name: string, version: number): Promise<IDBDatabase> {
	const existing = dbPromises[name]
	if (existing)
		return existing
	const promise = new Promise<IDBDatabase>(async (resolve, reject) => {
		const openRequest = await indexedDB.open(name, version)
		openRequest.onupgradeneeded = (event) => onUpgradeNeeded(name, event, reject)
		openRequest.onsuccess = () => {
			resolve(openRequest.result)
		}
		openRequest.onerror = () => {
			console.error(`failed to open db`, openRequest.error?.message)
			reject(openRequest.error)
			dbPromises[name] = null
		}
	})
	dbPromises[name] = promise
	return promise
}

function onUpgradeNeeded(
	name: string,
	event: IDBVersionChangeEvent,
	reject: (reason?: any) => void
) {
	const db = event.target.result
	db.onerror = () => {
		console.error(`failed to upgrade db`, db.error?.message)
		reject(db.error)
		dbPromises[name] = null
	}
	switch(name) {
		case "trpc": {
			db.createObjectStore("requests", {keyPath: "queryKey"})
			break
		}
		default: {
			throw new Error(`Trying to open unknown database ${name}`)
		}
	}
}

type QueryStorage<T> = {
	queryKey: string,
	result: T,
}

export async function storeQueryInIndexedDB<T>(queryKey: any, result: T) {
	const db = await openDB("trpc", 1)
	const tx = db.transaction("requests", "readwrite")
	const store = tx.objectStore("requests")
	const request = store.put({
		queryKey: JSON.stringify(queryKey),
		result,
	})
	request.onerror = () => {
		console.error(`failed to store request result ${JSON.stringify(queryKey)} in indexedDB`, request.error?.message)
	}
}

export async function retrieveQueryFromIndexedDB<T>(queryKey: any): Promise<T | null> {
	const db = await openDB("trpc", 1)
	const tx = db.transaction("requests")
	const store = tx.objectStore("requests")
	const request = store.get(JSON.stringify(queryKey)) as IDBRequest<QueryStorage<T>>
	return new Promise((resolve, reject) => {
		request.onerror = () => {
			console.error(`failed to retrieve request result ${JSON.stringify(queryKey)} from indexedDB`, request.error?.message)
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