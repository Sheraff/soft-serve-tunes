import { useEffect, useState } from "react"
import { buildRgb, formatHSL, extractPalette } from './utils'

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
		
		ref.current.addEventListener("load", (e) => {
			cancelIdleCallback(ricId)
			const img = e.target as HTMLImageElement
			ricId = requestIdleCallback(() => {
				const canvas = document.createElement("canvas")
				canvas.width = img.naturalWidth / 2
				canvas.height = img.naturalHeight / 2
				const ctx = canvas.getContext("2d")
				if (!ctx || canvas.height === 0 || canvas.width === 0) return
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
				ricId = requestIdleCallback(() => {
					const rgbArray = buildRgb(imageData.data)
					const main = extractPalette(rgbArray)
					setPalette({
						'--palette-bg-main': formatHSL(main[0]),
						'--palette-bg-gradient': formatHSL(main[1]),
						'--palette-secondary': formatHSL(main[2]),
						'--palette-primary': formatHSL(main[3]),
					} as React.CSSProperties)
				})
			})
		}, {signal: controller.signal})
		
		return () => {
			controller.abort()
			cancelIdleCallback(ricId)
		}
	}, [ref])

	return palette
}
