import { retrieveFromIndexedDB, storeInIndexedDB } from "./utils"

export async function storePaletteInIndexedDB<T>(src: string, result: T) {
	return storeInIndexedDB("palette", src, result)
}

export async function retrievePaletteFromIndexedDB<T>(src: string): Promise<T | null> {
	return retrieveFromIndexedDB("palette", src)
}