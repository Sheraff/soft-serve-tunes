import { useEffect, useRef } from "react"
import styles from "./index.module.css"

export default function DropTarget() {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const controller = new AbortController()
		document.body.addEventListener("dragover", e => {
			ref.current?.classList.add(styles.hover)
			e.preventDefault()
		}, { signal: controller.signal })
		ref.current?.addEventListener("dragleave", e => {
			ref.current?.classList.remove(styles.hover)
		}, { signal: controller.signal })
		ref.current?.addEventListener("drop", async (event) => {
			event.preventDefault()
			ref.current?.classList.remove(styles.hover)

			const itemList = event.dataTransfer?.items
			if (!itemList) return
			const fileEntries = await getAllFileEntries(itemList)
			const formData = new FormData()
			for (const fileEntry of fileEntries) {
				const file = await fileFromFileEntry(fileEntry)
				if (!file) continue
				if (file.name.startsWith('.')) continue
				formData.append("file[]", file)
				formData.append("name[]", fileEntry.fullPath)
			}

			await fetch('/api/upload', {method: "POST", body: formData})

		}, { signal: controller.signal })
		return () => controller.abort()
	}, [])
	return (
		<div ref={ref} className={styles.main}>
		</div>
	)
}

function fileFromFileEntry(fileEntry: FileSystemFileEntry) {
	return new Promise<File | null>((resolve, reject) => fileEntry.file(resolve, reject))
		.catch(() => null)
}


// Drop handler function to get all files
async function getAllFileEntries(dataTransferItemList: DataTransferItemList) {
	const fileEntries: FileSystemFileEntry[] = []
	const queue: (FileSystemEntry | FileSystemDirectoryEntry)[] = []
	for (const item of dataTransferItemList) {
		const entry = item.webkitGetAsEntry()
		if (entry) {
			queue.push(entry)
		}
	}
	let entry
	while (entry = queue.shift()) {
		if (entry.isFile) {
			const file = entry as FileSystemFileEntry
			fileEntries.push(file)
		} else if (entry.isDirectory) {
			const directory = entry as FileSystemDirectoryEntry
			queue.push(...await readAllDirectoryEntries(directory.createReader()))
		}
	}
	return fileEntries
}


async function readAllDirectoryEntries(directoryReader: FileSystemDirectoryReader) {
	const entries = []
	let readEntries
	do {
		readEntries = await readEntriesPromise(directoryReader)
		entries.push(...readEntries)
	} while (readEntries.length > 0)
	return entries
}

// readEntries will return only some of the entries in a directory
// e.g. Chrome returns at most 100 entries at a time
function readEntriesPromise(directoryReader: FileSystemDirectoryReader) {
	return new Promise<FileSystemEntry[]>((resolve) => {
		directoryReader.readEntries(resolve, () => resolve([]))
	})
}