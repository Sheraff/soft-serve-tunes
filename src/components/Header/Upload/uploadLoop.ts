import { getLocalHost } from "client/local-net/getLocalHost"
import { env } from "env/client.mjs"
import retryable from "utils/retryable"

async function upload(formData: FormData, onProgress: (progress: number) => void) {
	const host = await getLocalHost(true)
	const request = new XMLHttpRequest()
	request.upload.addEventListener("progress", (e) => {
		if (e.lengthComputable) {
			const progress = e.loaded / e.total
			onProgress(progress)
		} else {
			console.log("progress event not computable", e)
		}
	})
	const promise = new Promise<void>((resolve, reject) => {
		const controller = new AbortController()
		request.addEventListener("load", () => { controller.abort(), resolve() }, { signal: controller.signal })
		request.addEventListener("error", () => { controller.abort(), reject() }, { signal: controller.signal })
		request.addEventListener("abort", () => { controller.abort(), reject() }, { signal: controller.signal })
		request.addEventListener("timeout", () => { controller.abort(), reject() }, { signal: controller.signal })
	})
	if (host) {
		request.open("POST", `${host}/api/upload`)
	} else {
		request.open("POST", "/api/upload")
	}
	request.timeout = 3 * 60_000
	request.send(formData)
	return promise
}

const queuedUploads: {
	promise: Promise<void> | null
	total: number
} = {
	promise: null,
	total: 0,
}

export default async function uploadLoop<T extends FileSystemFileEntry | File>(
	list: T[],
	parse: (item: T) => Promise<({ size: number, file: File, path: string } | undefined)>,
	onProgress: (p: number) => void
) {
	const beforeCount = queuedUploads.total
	const beforePromise = queuedUploads.promise

	let resolve: (() => void) | null = null
	const promise = queuedUploads.promise
		? queuedUploads.promise.then(() => new Promise<void>(res => resolve = res))
		: new Promise<void>(res => resolve = res)
	queuedUploads.promise = promise
	queuedUploads.total += list.length
	if (beforePromise) {
		await beforePromise
	}

	let formData = new FormData()
	let payloadSize = 0
	let isFirst = !beforeCount
	let lastBatchStartIndex = 0
	try {
		for (let i = 0; i < list.length; i++) {
			const item = list[i] as T
			const data = await parse(item)
			if (data) {
				payloadSize += data.size
				formData.append("file[]", data.file)
				formData.append("name[]", data.path)
				formData.append("index[]", String(beforeCount + i))
				formData.append("of[]", String(queuedUploads.total - 1))
				formData.append("wakeup[]", isFirst ? "wakeup" : "")
				isFirst = false
			}
			if (
				i === list.length - 1
				|| (
					payloadSize > env.NEXT_PUBLIC_UPLOAD_CHUNK_SIZE * 1_048_576
					&& payloadSize > 0
				)
			) {
				await retryable(() => upload(formData, (progress) => {
					const base = (lastBatchStartIndex + beforeCount) / queuedUploads.total
					const end = (i + 1 + beforeCount) / queuedUploads.total
					onProgress(base + (end - base) * progress)
				}))
				formData = new FormData()
				payloadSize = 0
				lastBatchStartIndex = i + 1
			}
		}
	} catch { }
	(resolve as unknown as () => void)()
	if (queuedUploads.promise === promise) {
		queuedUploads.promise = null
		queuedUploads.total = 0
		onProgress(1)
	}
}