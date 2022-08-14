import { useEffect, useState } from "react"
import { buildRgb, quantization, convertRGBtoHSL, averageImageValue, formatHSL, complementaryHSL } from './utils'

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
					const quantColors = quantization(rgbArray, 0, 2)
					const hslColors = quantColors.map(convertRGBtoHSL)
					const average = averageImageValue(imageData.data)
					if (average > 255 / 2) {
						setPalette({
							'--palette-bg-main': formatHSL(hslColors[3]),
							'--palette-bg-gradient': formatHSL(hslColors[2]),
							'--palette-secondary': formatHSL({...hslColors[1], l: 20, s: 50}),
							'--palette-primary': formatHSL({...hslColors[0], l: 20, s: 50}),
							'--complementary-bg-main': complementaryHSL(hslColors[3]),
							'--complementary-bg-gradient': complementaryHSL(hslColors[2]),
							'--complementary-secondary': complementaryHSL({...hslColors[1], l: 20, s: 50}),
							'--complementary-primary': complementaryHSL({...hslColors[0], l: 20, s: 50}),
						} as React.CSSProperties)
					} else {
						setPalette({
							'--palette-bg-main': formatHSL(hslColors[0]),
							'--palette-bg-gradient': formatHSL(hslColors[1]),
							'--palette-secondary': formatHSL({...hslColors[2], l: 80, s: 50}),
							'--palette-primary': formatHSL({...hslColors[3], l: 80, s: 50}),
							'--complementary-bg-main': complementaryHSL(hslColors[0]),
							'--complementary-bg-gradient': complementaryHSL(hslColors[1]),
							'--complementary-secondary': complementaryHSL({...hslColors[2], l: 80, s: 50}),
							'--complementary-primary': complementaryHSL({...hslColors[3], l: 80, s: 50}),
						} as React.CSSProperties)
					}
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
