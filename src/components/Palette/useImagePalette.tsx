import { CSSProperties, RefObject, useEffect, useState } from "react"
import { retrievePaletteFromIndexedDB, storePaletteInIndexedDB } from "../../client/db/palette"

export default function useImagePalette({
	ref,
	defaultValues = {},
}: {
	ref: RefObject<HTMLImageElement>,
	defaultValues?: CSSProperties,
}) {
	const [palette, setPalette] = useState<CSSProperties>(defaultValues)
	useEffect(() => {
		if(!ref.current) return
		const controller = new AbortController()
		let ricId: number
		const worker = new Worker(new URL("./palette.worker", import.meta.url), { type: "module" })
		let srcForCurrentPalette = ""
		worker.addEventListener("message", (e) => {
			const data = e.data as {
				palette: string[],
				src: string,
			}
			if (
				data.src === ref.current?.src // is for the current image
				&& data.src !== srcForCurrentPalette // hasn't been set yet
			) {
				setPalette({
					'--palette-bg-main': data.palette[0],
					'--palette-bg-gradient': data.palette[1],
					'--palette-secondary': data.palette[2],
					'--palette-primary': data.palette[3],
				} as CSSProperties)
				srcForCurrentPalette = data.src
			}
			storePaletteInIndexedDB(data.src, data.palette)
		}, {signal: controller.signal})

		const observer = new MutationObserver(async ([mutation]) => {
			if (!mutation) return
			const {src} = mutation.target as HTMLImageElement
			if (!src || src === srcForCurrentPalette) return
			const palette = await retrievePaletteFromIndexedDB<string[]>(src)
			if (
				palette
				&& src === ref.current?.src // is for the current image
				&& src !== srcForCurrentPalette // hasn't been set yet
			) {
				setPalette({
					'--palette-bg-main': palette[0],
					'--palette-bg-gradient': palette[1],
					'--palette-secondary': palette[2],
					'--palette-primary': palette[3],
				} as React.CSSProperties)
				srcForCurrentPalette = src
			}
		})
		observer.observe(ref.current, {
			attributes: true,
			attributeFilter: ["src"],
		})
		
		ref.current.addEventListener("load", (e) => {
			cancelIdleCallback(ricId)
			const img = e.target as HTMLImageElement
			if (!img.src || img.src === srcForCurrentPalette) {
				return
			}
			const canvas = document.createElement("canvas")
			canvas.width = 300
			canvas.height = 300
			const ctx = canvas.getContext("2d")
			if (!ctx || canvas.height === 0 || canvas.width === 0) return
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height, )
			const imageData = ctx.getImageData(canvas.width * .05, canvas.height * .05, canvas.width * .9, canvas.height * .9)
			worker.postMessage({ imageData, src: img.src }, [imageData.data.buffer])
		}, {signal: controller.signal, passive: true})
		
		return () => {
			controller.abort()
			cancelIdleCallback(ricId)
			worker.terminate()
			observer.disconnect()
		}
	}, [ref])

	return palette
}
