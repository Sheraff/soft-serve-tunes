import { useEffect, useState } from "react"
import { buildRgb, quantization, convertRGBtoHSL, averageImageValue, formatHSL } from './utils'

export default function useImagePalette({
	ref
}: {
	ref: React.RefObject<HTMLImageElement>
}) {
	const [palette, setPalette] = useState({})
	useEffect(() => {
		if(!ref.current) return
		const controller = new AbortController()
		
		ref.current.addEventListener("load", (e) => {
			const img = e.target as HTMLImageElement
			const canvas = document.createElement("canvas")
			canvas.width = img.naturalWidth
			canvas.height = img.naturalHeight
			const ctx = canvas.getContext("2d")
			if (!ctx) return
			ctx.drawImage(img, 0, 0)
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
			const rgbArray = buildRgb(imageData.data)
			const quantColors = quantization(rgbArray, 0, 2)
			const hslColors = quantColors.map(convertRGBtoHSL)
			const darkMode = matchMedia("(prefers-color-scheme: dark)").matches
			const lightMode = matchMedia("(prefers-color-scheme: light)").matches
			const average = darkMode 
				? 0 
				: lightMode
				? 255
				: averageImageValue(imageData.data)
			console.log(formatHSL({...hslColors[3], l: 70, s: 40}))
			if (average > 255 / 2) {
				setPalette({
					background: formatHSL(hslColors[3]),
					gradient: formatHSL(hslColors[2]),
					foreground: formatHSL({...hslColors[0], l: 20, s: 50}),
				})
			} else {
				setPalette({
					background: formatHSL(hslColors[0]),
					gradient: formatHSL(hslColors[1]),
					foreground: formatHSL({...hslColors[3], l: 80, s: 50}),
				})
			}
		}, {signal: controller.signal})
		
		return () => controller.abort()
	}, [ref])

	return palette
}
