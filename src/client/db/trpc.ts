import { retrieveFromIndexedDB, storeInIndexedDB } from "./utils"

export async function storeQueryInIndexedDB<T>(queryKey: any, result: T) {
	return storeInIndexedDB("requests", JSON.stringify(queryKey), result)
}

export async function retrieveQueryFromIndexedDB<T>(queryKey: string): Promise<T | null> {
	return retrieveFromIndexedDB("requests", queryKey)
}