import { useEffect, useRef } from "react"
import { env } from "env/client.mjs"
import { useProgressBar } from "components/ProgressBar"
import styles from "./index.module.css"

export default function DropTarget() {
	const ref = useRef<HTMLDivElement>(null)
	const setProgress = useProgressBar()
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
			let formData = new FormData()
			let payloadSize = 0
			let isFirst = true
			let lastBatchStartIndex = 0
			try {
				for (let i = 0; i < fileEntries.length; i++) {
					const fileEntry = fileEntries[i] as FileSystemFileEntry
					const file = await fileFromFileEntry(fileEntry)
					if (file && !file.name.startsWith('.') && file.type.startsWith('audio/')) {
						payloadSize += file.size
						formData.append("file[]", file)
						formData.append("name[]", fileEntry.fullPath)
						formData.append("index[]", String(i))
						formData.append("of[]", String(fileEntries.length - 1))
						formData.append("wakeup[]", isFirst ? "wakeup" : "")
						isFirst = false
					}
					if (
						i === fileEntries.length - 1
						|| (
							payloadSize > env.NEXT_PUBLIC_UPLOAD_CHUNK_SIZE * 1_048_576
							&& payloadSize > 0
						)
					) {
						const base = lastBatchStartIndex / fileEntries.length
						const end = (i + 1) / fileEntries.length
						await upload(formData, (progress) => {
							setProgress(base + (end - base) * progress)
						})
						formData = new FormData()
						payloadSize = 0
						lastBatchStartIndex = i + 1
					}
				}
			} catch {}
			setProgress(1)
		}, { signal: controller.signal })
		return () => controller.abort()
	}, [setProgress])

	// useEffect(() => {
	// 	const controller = new AbortController()
	// 	const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
	// 	socket.addEventListener("message", (e) => {
	// 		const data = JSON.parse(e.data)
	// 		if (data.type === "upload:progress"){
	// 			setProgress(data.payload)
	// 		}
	// 	}, {signal: controller.signal})
	// 	return () => {
	// 		controller.abort()
	// 		socket.close()
	// 	}
	// }, [setProgress])

	return (
		<div ref={ref} className={styles.main}>
		</div>
	)
}

function upload(formData: FormData, onProgress: (progress: number) => void) {
	const request = new XMLHttpRequest()

	request.upload.addEventListener('progress', (e) => {
		if (e.lengthComputable) {
			const progress = e.loaded / e.total
			onProgress(progress)
		} else {
			console.log('progress event not computable', e)
		}
	})
	const promise = new Promise<void>((resolve, reject) => {
		const controller = new AbortController()
		request.addEventListener('load', () => { controller.abort(), resolve() }, {signal: controller.signal})
		request.addEventListener('error', () => { controller.abort(), reject() }, {signal: controller.signal})
		request.addEventListener('abort', () => { controller.abort(), reject() }, {signal: controller.signal})
		request.addEventListener('timeout', () => { controller.abort(), reject() }, {signal: controller.signal})
	})
	request.open('POST', '/api/upload')
	request.timeout = 3 * 60_000
	request.send(formData)
	return promise
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