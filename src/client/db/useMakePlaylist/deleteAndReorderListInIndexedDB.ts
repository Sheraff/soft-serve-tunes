import { openDB } from "client/db/utils"
import { type PlaylistDBEntry } from "./types"

/**
 * @description sets indexedDB playlist to the given `order` (deleting any tracks that are not in `order`)
 */
export default async function deleteAndReorderListInIndexedDB(order: string[]) {
	const db = await openDB()
	const tx = db.transaction("playlist", "readwrite")
	const store = tx.objectStore("playlist")
	const cursorRequest = store.openCursor()
	return new Promise((resolve, reject) => {
		cursorRequest.onerror = () => {
			console.error(new Error("couldn't open cursor on in indexedDB \"playlist\" to reorder list", {cause: tx.error}))
			reject(tx.error)
		}
		cursorRequest.onsuccess = () => {
			const cursor = cursorRequest.result
			if (cursor) {
				const item = cursor.value.result as PlaylistDBEntry
				const index = order.indexOf(item.track.id)
				if (index !== -1) {
					item.index = index
					cursor.update({key: cursor.value.key, result: item})
				} else {
					cursor.delete()
				}
				cursor.continue()
			}
		}
		tx.oncomplete = resolve
	})
}