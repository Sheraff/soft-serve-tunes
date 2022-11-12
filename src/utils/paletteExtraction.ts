type RGBPixel = {
	r: number
	g: number
	b: number
}

type HSLPixel = {
	h: number
	s: number
	l: number
	lum: number
}

type FourHslPixels = [HSLPixel, HSLPixel, HSLPixel, HSLPixel]

function buildRgb (imageData: Uint8ClampedArray, channels: 3 | 4) {
	const rgbValues = [] as RGBPixel[]
	for (let i = 0; i < imageData.length - (channels - 1); i += channels) {
		const rgb = {
			r: imageData[i] as number,
			g: imageData[i + 1] as number,
			b: imageData[i + 2] as number,
		};

		rgbValues.push(rgb)
	}
	return rgbValues
}

function sortByIncreasingLightnessDifference([ref, ...colors]: FourHslPixels): FourHslPixels {
	colors.sort((a, b) => {
		const contrastRatioA = Math.abs(a.l - ref.l)
		const contrastRatioB = Math.abs(b.l - ref.l)
		return contrastRatioA - contrastRatioB
	})
	return [ref, ...colors]
}

function minimumFourColors([first, ...colors]: [HSLPixel, ...HSLPixel[]]): FourHslPixels {
	const [a, b, c] = colors
	if (!a) {
		const other = first.l > 50
			? {h: 0, s: 0, l: 0, lum: 0}
			: {h: 0, s: 0, l: 100, lum: 1}
		return [first, first, other, other]
	}
	if (!b) {
		return [first, first, a, a]
	}
	if (!c) {
		return [first, a, b, b]
	}
	return [first, a, b, c]
}

function contrastRatio(lum1: number, lum2: number) {
	const ratio = (lum1 + 0.05) / (lum2 + 0.05)
	return ratio
}

function minColorRatio([bg, _, __, main]: FourHslPixels): FourHslPixels {
	const maxLum = Math.max(bg.lum, main.lum)
	const minLum = Math.min(bg.lum, main.lum)
	const max = maxLum === bg.lum ? bg : main
	const min = minLum === bg.lum ? bg : main
	const ratio = contrastRatio(maxLum, minLum)

	if (ratio >= 4) {
		return [bg, _, __, main]
	}

	// if the most luminous if significantly lighter than the least luminous, make it even more white
	const deltaLight = Math.abs(bg.l - main.l)
	const maxLight = Math.max(bg.l, main.l)
	if (deltaLight > 10 && max.l === maxLight) {
		max.l += (100 - max.l) / 2
		return [bg, _, __, main]
	}

	// if the most luminous is close to white, make least luminous more black
	// if the least luminous is close to black, make most luminous more white
	const deltaSat = Math.abs(bg.s - main.s)
	if (deltaSat > 10 && max.l >= 80) {
		min.l -= min.l * 0.75
		return [bg, _, __, main]
	}
	if (deltaSat > 10 && min.l <= 20) {
		max.l += (100 - max.l) * 0.75
		return [bg, _, __, main]
	}

	// fallback:
	// if most luminous is still not very luminous (overall dark image), make least luminous more white
	// if least luminous is already very luminous (overall light image), make most luminous more black
	if (maxLum <= 0.5) {
		max.l += (1 - max.l) / 2
	} else if (minLum >= 0.5) {
		min.l -= min.l / 2
	} else {
		max.l += (1 - max.l) / 2
		min.l -= min.l / 2
	}
	return [bg, _, __, main]
}

function equalHsl(a: HSLPixel, b: HSLPixel): boolean {
	return a.h === b.h && a.s === b.s && a.l === b.l
}

function sortSecondariesByColorIntensity([first, a, b, last]: FourHslPixels): FourHslPixels {
	if (equalHsl(first, a) || equalHsl(b, last) || equalHsl(a, b)) {
		return [first, a, b, last]
	}
	const aSaturation = a.s / 100
	const bSaturation = b.s / 100
	const aColorIntensity = 1 - Math.abs(a.l - 50) / 50
	const bColorIntensity = 1 - Math.abs(b.l - 50) / 50
	const aScore = aSaturation * aColorIntensity
	const bScore = bSaturation * bColorIntensity
	if (aScore * 0.7 > bScore) {
		return [first, b, a, last]
	}
	return [first, a, b, last]
}

// function sortByGlobalLuminance(allColors: [HSLPixel, number][], palette: FourHslPixels): FourHslPixels {
// 	const lumSumAndCount = allColors.reduce(([sum, total], [color, count]) => ([
// 		sum + color.lum * count,
// 		total + count
// 	]), [0, 0] as [number, number]) as [number, number]
// 	const avgLum = lumSumAndCount[0] / lumSumAndCount[1]
// 	if (
// 		(avgLum > 0.7 && palette[0].lum < .5)
// 		|| (avgLum < 0.3 && palette[0].lum > .5)
// 	) {
// 		palette.reverse()
// 	}

// 	return palette
// }

function extractPalette(values: RGBPixel[]) {
	const colorCount = values.reduce((prev, curr) => {
		prev[curr.r + ',' + curr.g + ',' + curr.b] = (prev[curr.r + ',' + curr.g + ',' + curr.b] || 0) + 1
		return prev
	} , {} as {[key: string]: number})

	const byPrevalence = Object.entries(colorCount).sort((a, b) => b[1] - a[1])

	const aggregateSimilar = byPrevalence.reduce((prev, [string, count]) => {
		const [r, g, b] = string.split(',').map(Number) as [number, number, number]
		const rgb = {r, g, b} as RGBPixel
		const color = convertRGBtoHSL(rgb)
		if (prev.length === 0) {
			prev.push([color, count])
			return prev
		}
		const same = prev.find(([c]) => !hslColorsAreSignificantlyDifferent(c, color))
		if (!same) {
			prev.push([color, count])
		} else {
			same[1] += count
		}
		return prev
	}, [] as [HSLPixel, number][])

	
	const sortedAggregates = aggregateSimilar
		.sort((a, b) => b[1] - a[1])

	const mainColors: [HSLPixel, ...HSLPixel[]] = [sortedAggregates[0]![0]]
	const relevanceThreshold = values.length * 0.0005 // 0.05% of all pixels are this color
	for (let i = 1; i < sortedAggregates.length; i++) {
		const [color, count] = sortedAggregates[i]!
		if (count < relevanceThreshold) {
			console.log('break for: if (count < relevanceThreshold) {', count, relevanceThreshold)
			break
		}
		mainColors.push(color)
		if (mainColors.length === 4) {
			console.log('break for: if (mainColors.length === 4) {')
			break
		}
	}

	const fourColors = minimumFourColors(mainColors)
	const firstLastContrast = sortByIncreasingLightnessDifference(fourColors)
	const secondaryIsColorful = sortSecondariesByColorIntensity(firstLastContrast)
	// const themed = sortByGlobalLuminance(aggregateSimilar, secondaryIsColorful)
	const palette = minColorRatio(secondaryIsColorful)

	return palette
}

function hslColorsAreSignificantlyDifferent(color1: HSLPixel, color2: HSLPixel) {
	const lDiff = Math.abs(color1.l - color2.l)
	if (lDiff < 10 && (color1.l > 90 || color2.l > 90 || color1.l < 10 || color2.l < 10)) {
		return false
	}
	const sDiff = Math.abs(color1.s - color2.s)
	if (sDiff < 10 && (color1.s < 10 || color2.s < 10)) {
		return false
	}
	const hDiff = Math.min(
		Math.abs(color1.h - color2.h),
		Math.abs(color1.h + 360 - color2.h),
		Math.abs(color1.h - 360 - color2.h)
	)
	if ((sDiff + lDiff) < 500 / hDiff) {
		return false
	}
	const diff = hDiff / 360 + sDiff / 100 + lDiff / 100
	return diff > 0.3
}

function channelLuminance(value: number) {
	return value <= .03928 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
}

function convertRGBtoHSL (pixel: RGBPixel): HSLPixel {
	// https://www.had2know.org/technology/hsl-rgb-color-converter.html
	const r = pixel.r / 255
	const g = pixel.g / 255
	const b = pixel.b / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const delta = max - min

	const lum = .2126 * channelLuminance(r) + .7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)

	const l = (max + min) / 2

	if (delta <= 2 / 255) {
		return {
			h: 0,
			s: 0,
			l: l * 100,
			lum,
		}
	}

	const s = delta / (1 - Math.abs(2 * l - 1))

	let h: number
	if (max === r) {
		h = (0 + (g - b) / delta) / 6
	} else if (max === g) {
		h = (2 + (b - r) / delta) / 6
	} else if (max === b) {
		h = (4 + (r - g) / delta) / 6
	} else {
		h = 0
	}

	return {
		h: Math.round(360 * h),
		s: s * 100,
		l: l * 100,
		lum,
	}
}

function formatHSL({h = 0, s = 0, l = 0}: {h?: number, s?: number, l?:number} = {}): string {
	return `hsl(${h}, ${s}%, ${l}%)`
}

export default function extractPaletteFromUint8(data: Uint8ClampedArray, channels: 3 | 4 = 4) {
	const rgbArray = buildRgb(data, channels)
	const main = extractPalette(rgbArray)
	const palette = main.map(formatHSL)
	return palette
}