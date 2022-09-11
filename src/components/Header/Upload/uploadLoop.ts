import { env } from "env/client.mjs"
import retryable from "utils/retryable"

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

export default async function uploadLoop<T extends FileSystemFileEntry | File>(
	list: T[],
	parse: (item: T) => Promise<({size: number, file: File, path: string} | undefined)>,
	onProgress: (p: number) => void
) {
	let formData = new FormData()
	let payloadSize = 0
	let isFirst = true
	let lastBatchStartIndex = 0
	try {
		for (let i = 0; i < list.length; i++) {
			const item = list[i] as T
			const data = await parse(item)
			if (data) {
				payloadSize += data.size
				formData.append("file[]", data.file)
				formData.append("name[]", data.path)
				formData.append("index[]", String(i))
				formData.append("of[]", String(list.length - 1))
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
				const base = lastBatchStartIndex / list.length
				const end = (i + 1) / list.length
				await retryable(() => upload(formData, (progress) => {
					onProgress(base + (end - base) * progress)
				}))
				formData = new FormData()
				payloadSize = 0
				lastBatchStartIndex = i + 1
			}
		}
	} catch {}
	onProgress(1)
}