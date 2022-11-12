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

// function sortByIncreasingContrastRatio([ref, ...colors]: [HSLPixel, ...HSLPixel[]]) {
// 	colors.sort((a, b) => {
// 		const contrastRatioA = contrastRatio(ref.lum, a.lum)
// 		const contrastRatioB = contrastRatio(ref.lum, b.lum)
// 		return contrastRatioA - contrastRatioB
// 	})
// 	return [ref, ...colors]
// }

// function contrastRatio(lum1: number, lum2: number) {
// 	const ratio = (lum1 + 0.05) / (lum2 + 0.05)
// 	return ratio
// }

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

function sortByIncreasingLightnessDifference([ref, ...colors]: [HSLPixel, HSLPixel, HSLPixel, HSLPixel]): [HSLPixel, HSLPixel, HSLPixel, HSLPixel] {
	colors.sort((a, b) => {
		const contrastRatioA = Math.abs(a.l - ref.l)
		const contrastRatioB = Math.abs(b.l - ref.l)
		return contrastRatioA - contrastRatioB
	})
	return [ref, ...colors]
}

function minimumFourColors([first, ...colors]: [HSLPixel, ...HSLPixel[]]): [HSLPixel, HSLPixel, HSLPixel, HSLPixel] {
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

function sortSecondariesByColorIntensity([first, a, b, last]: [HSLPixel, HSLPixel, HSLPixel, HSLPixel]): [HSLPixel, HSLPixel, HSLPixel, HSLPixel] {
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

	const mainColors = aggregateSimilar
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([color]) => color) as [HSLPixel, ...HSLPixel[]]

	const fourColors = minimumFourColors(mainColors)
	const firstLastContrast = sortByIncreasingLightnessDifference(fourColors)
	const secondaryIsColorful = sortSecondariesByColorIntensity(firstLastContrast)

	const lumSumAndCount = aggregateSimilar.reduce(([sum, total], [color, count]) => ([
		sum + color.lum * count,
		total + count
	]), [0, 0] as [number, number]) as [number, number]
	const avgLum = lumSumAndCount[0] / lumSumAndCount[1]
	if(
		(avgLum > 0.7 && secondaryIsColorful[0].lum < .5)
		|| (avgLum < 0.3 && secondaryIsColorful[0].lum > .5)
	) {
		secondaryIsColorful.reverse()
	}

	return secondaryIsColorful
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