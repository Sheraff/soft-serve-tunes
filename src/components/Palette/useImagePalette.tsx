import { useEffect, useState } from "react"

export default function useImagePalette({
	ref
}: {
	ref: React.RefObject<HTMLImageElement>
}) {
	const [palette, setPalette] = useState<React.CSSProperties>({})
	useEffect(() => {
		if(!ref.current) return
		const controller = new AbortController()
		let ricId: number
		const worker = new Worker(new URL("./palette.worker", import.meta.url), { type: "module" })
		worker.addEventListener("message", (e) => {
			const data = e.data as {
				palette: string[]
			}
			setPalette({
				'--palette-bg-main': data.palette[0],
				'--palette-bg-gradient': data.palette[1],
				'--palette-secondary': data.palette[2],
				'--palette-primary': data.palette[3],
			} as React.CSSProperties)
		}, {signal: controller.signal})
		
		ref.current.addEventListener("load", (e) => {
			cancelIdleCallback(ricId)
			const img = e.target as HTMLImageElement
			const canvas = document.createElement("canvas")
			canvas.width = img.naturalWidth / 2
			canvas.height = img.naturalHeight / 2
			const ctx = canvas.getContext("2d")
			if (!ctx || canvas.height === 0 || canvas.width === 0) return
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			worker.postMessage({ imageData }, [imageData.data.buffer])
		}, {signal: controller.signal, passive: true})
		
		return () => {
			controller.abort()
			cancelIdleCallback(ricId)
			worker.terminate()
		}
	}, [ref])

	return palette
}
