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

function sortByIncreasingLightnessDifference([ref, ...colors]: FourHslPixels): FourHslPixels {
	// sort by lightness, order is based on distance from first color
	const [a, b, last] = colors.sort((a, b) => {
		const contrastRatioA = Math.abs(a.l - ref.l)
		const contrastRatioB = Math.abs(b.l - ref.l)
		return contrastRatioA - contrastRatioB
	})
	const lightDelta = ref.l - last.l
	if (Math.abs(lightDelta) < 20) {
		return [ref, ...colors]
	}
	// if there is a significant difference in lightness between 1st and last, sort middle too
	const refDark = lightDelta < 0
	const min = a.l < b.l ? a : b
	const max = min === b ? a : b
	if (refDark) {
		return [ref, min, max, last]
	} else {
		return [ref, max, min, last]
	}
}

/**
 * @description Fills array of HSL colors to be of length 4
 * - if only 1 color is provided, a second color (black or white) is added
 * - if 2 colors are provided, an array of `[a, a, b, b]` is returned
 * - if 3 colors are provided, an array of `[a, b, c, c]` is returned
 */
function minimumFourColors([first, ...colors]: [HSLPixel, ...HSLPixel[]]): FourHslPixels {
	const [a, b, c] = colors
	if (!a) {
		const other = first.l > 50
			? {h: 0, s: 0, l: 0, lum: 0}
			: {h: 0, s: 0, l: 100, lum: 100}
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
	const ratio = (lum1 + 5) / (lum2 + 5)
	return ratio
}

function ratioBetweenTwoHsl(a: HSLPixel, b: HSLPixel): number {
	const maxLum = Math.max(a.lum, b.lum)
	const minLum = Math.min(a.lum, b.lum)
	const ratio = contrastRatio(maxLum, minLum)
	return ratio
}

function getMaxColorRatioFromList(list: HSLPixel[]) {
	let maxRatio = -Infinity
	if (list.length === 1) {
		const fills = [
			{h: 0, s: 0, l: 0, lum: 0},
			{h: 0, s: 0, l: 100, lum: 100},
		]
		for (let i = 0; i < fills.length; i++) {
			const ratio = ratioBetweenTwoHsl(list[0]!, fills[i]!)
			if (ratio > maxRatio) {
				maxRatio = ratio
			}
		}
	} else {
		for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const ratio = ratioBetweenTwoHsl(list[i]!, list[j]!)
				if (ratio > maxRatio) {
					maxRatio = ratio
				}
			}
		}
	}
	return maxRatio
}

// /**
//  * @description Insures a minimum contrast ratio of 2 between first and last
//  * color by manipulating lightness if needed
//  */
// function minColorRatio([bg, _, __, main]: FourHslPixels): FourHslPixels {
// 	const maxLum = Math.max(bg.lum, main.lum)
// 	const minLum = Math.min(bg.lum, main.lum)
// 	const max = maxLum === bg.lum ? bg : main
// 	const min = minLum === bg.lum ? bg : main
// 	const ratio = contrastRatio(maxLum, minLum)

// 	if (ratio >= 2) {
// 		return [bg, _, __, main]
// 	}

// 	// if the most luminous if significantly lighter than the least luminous, make it even more white
// 	const deltaLight = Math.abs(bg.l - main.l)
// 	const maxLight = Math.max(bg.l, main.l)
// 	if (deltaLight > 10 && max.l === maxLight) {
// 		max.l += (100 - max.l) / 2
// 		return [bg, _, __, main]
// 	}

// 	// if the most luminous is close to white, make least luminous more black
// 	// if the least luminous is close to black, make most luminous more white
// 	const deltaSat = Math.abs(bg.s - main.s)
// 	if (deltaSat > 10 && max.l >= 80) {
// 		min.l -= min.l * 0.75
// 		return [bg, _, __, main]
// 	}
// 	if (deltaSat > 10 && min.l <= 20) {
// 		max.l += (100 - max.l) * 0.75
// 		return [bg, _, __, main]
// 	}

// 	// fallback:
// 	// if most luminous is still not very luminous (overall dark image), make most luminous more white
// 	// if least luminous is already very luminous (overall vibrant image), make least luminous more black
// 	if (maxLum <= 50) {
// 		max.l += (1 - max.l) / 2
// 	} else if (minLum >= 50) {
// 		min.l -= min.l / 2
// 	} else {
// 		max.l += (1 - max.l) / 2
// 		min.l -= min.l / 2
// 	}
// 	return [bg, _, __, main]
// }

// function equalHsl(a: HSLPixel, b: HSLPixel): boolean {
// 	return a.h === b.h && a.s === b.s && a.l === b.l
// }

// function sortSecondariesByColorIntensity([first, a, b, last]: FourHslPixels): FourHslPixels {
// 	if (equalHsl(first, a) || equalHsl(b, last) || equalHsl(a, b)) {
// 		return [first, a, b, last]
// 	}
// 	const aSaturation = a.s / 100
// 	const bSaturation = b.s / 100
// 	const aColorIntensity = 1 - Math.abs(a.l - 50) / 50
// 	const bColorIntensity = 1 - Math.abs(b.l - 50) / 50
// 	const aScore = aSaturation * aColorIntensity
// 	const bScore = bSaturation * bColorIntensity
// 	if (aScore * 0.7 > bScore) {
// 		return [first, b, a, last]
// 	}
// 	return [first, a, b, last]
// }

// /**
//  * @description if the overall palette is dark but the first color is light, or vice versa, reverse the palette
//  */
// function sortByGlobalLuminance(allColors: [HSLPixel, number][], palette: FourHslPixels): FourHslPixels {
// 	const lumSumAndCount = allColors.reduce(([sum, total], [color, count]) => ([
// 		sum + color.lum * count,
// 		total + count
// 	]), [0, 0] as [number, number]) as [number, number]
// 	const avgLum = lumSumAndCount[0] / lumSumAndCount[1]
// 	if (
// 		(avgLum > 70 && palette[0].lum < 50)
// 		|| (avgLum < 30 && palette[0].lum > 50)
// 	) {
// 		palette.reverse()
// 	}

// 	return palette
// }

/**
 * @description insures a minimum luminance difference between first and last color
 * (after this step, the luminance value might not be correct anymore, not recalculating it)
 */
function minLuminanceDifference([bg, _, __, main]: FourHslPixels): FourHslPixels {
	const minLum = Math.min(bg.lum, main.lum)
	const maxLum = Math.max(bg.lum, main.lum)
	const deltaLum = maxLum - minLum
	if (deltaLum > 35 || Math.abs(bg.l - main.l) > 35) {
		return [bg, _, __, main]
	}
	const minLig = Math.min(bg.l, main.l)
	const min = minLig === bg.l ? bg : main
	const max = minLig === bg.l ? main : bg
	const minDeltaToCap = min.l
	const maxDeltaToCap = 100 - max.l
	if (minDeltaToCap > maxDeltaToCap) {
		min.l = Math.max(0, min.l - 10)
		min.s = Math.max(0, min.s - 10)
	} else {
		max.l = Math.min(100, max.l + 10)
		max.s = Math.max(0, max.s - 10)
	}
	return [bg, _, __, main]
}

function extractPalette(imageData: Uint8ClampedArray, channels: 3 | 4) {
	// count how many pixels there are of each color
	const colorCount: {[key: string]: {count: number, hsl: HSLPixel}} = {}
	for (let i = 0; i < imageData.length - (channels - 1); i += channels) {
		const r = imageData[i]!
		const g = imageData[i + 1]!
		const b = imageData[i + 2]!
		const key = r + "," + g + "," + b

		if (colorCount[key]) {
			colorCount[key]!.count += 1
		} else {
			colorCount[key] = {
				count: 1,
				hsl: convertRGBtoHSL({r, g, b})
			}
		}
	}

	const byPrevalence = Object.values(colorCount).sort((a, b) => b.count - a.count)

	// convert to HSL, keep only significantly different colors
	const aggregateSimilar = byPrevalence.reduce((prev, {count, hsl}) => {
		if (prev.length === 0) {
			prev.push([hsl, count])
			return prev
		}
		const same = prev.find(([c]) => !hslColorsAreSignificantlyDifferent(c, hsl))
		if (!same) {
			prev.push([hsl, count])
		} else {
			same[1] += count
		}
		return prev
	}, [] as [HSLPixel, number][])

	const sortedAggregates = aggregateSimilar
		.sort((a, b) => b[1] - a[1])

	// filter out colors that don't represent a significant area of the image, keep 4 colors max
	const mainColors: [HSLPixel, ...HSLPixel[]] = [sortedAggregates[0]![0]]
	const relevanceThreshold = imageData.length / channels * 0.0005 // 0.05% of all pixels are this color
	for (let i = 1; i < sortedAggregates.length; i++) {
		const [color, count] = sortedAggregates[i]!
		if (count < relevanceThreshold) {
			break
		}
		mainColors.push(color)
		if (mainColors.length === 4) {
			break
		}
	}
	// if adding 1 more color would improve contrast ratio, add it
	if (sortedAggregates.length > mainColors.length) {
		const maxRatio = getMaxColorRatioFromList(mainColors)
		if (mainColors.length < 4) {
			const candidateColor = sortedAggregates[mainColors.length]![0]
			for (const color of mainColors) {
				const ratio = ratioBetweenTwoHsl(color, candidateColor)
				if (ratio > maxRatio) {
					mainColors.push(candidateColor)
					break
				}
			}
		} else {
			const candidateColor = sortedAggregates[mainColors.length]![0]
			for (let i = 0; i < mainColors.length - 1; i++) {
				const ratio = ratioBetweenTwoHsl(mainColors[i]!, candidateColor)
				if (ratio > maxRatio) {
					mainColors[3] = candidateColor
					break
				}
			}
		}
	}

	const fourColors = minimumFourColors(mainColors)
	const firstLastContrast = sortByIncreasingLightnessDifference(fourColors)
	// return firstLastContrast
	const alterColorsForLum = minLuminanceDifference(firstLastContrast)
	return alterColorsForLum
	// const secondaryIsColorful = sortSecondariesByColorIntensity(firstLastContrast)
	// const themed = sortByGlobalLuminance(aggregateSimilar, firstLastContrast)
	// return themed
	// const palette = minColorRatio(firstLastContrast)
	// return palette
}

function hslColorsAreSignificantlyDifferent(color1: HSLPixel, color2: HSLPixel) {
	// if lightness is similar and close to the extremes (full white or full black), colors are not different
	const lDiff = Math.abs(color1.l - color2.l)
	if (lDiff < 10 && (color1.l > 90 || color2.l > 90 || color1.l < 10 || color2.l < 10)) {
		return false
	}
	// if saturation is similar and close to zero (gray), colors are not different
	const sDiff = Math.abs(color1.s - color2.s)
	if (sDiff < 10 && (color1.s < 10 || color2.s < 10)) {
		return false
	}
	// if hue is not different enough to compensate for lightness and saturation similarity, colors are not different
	const angleDiff = Math.abs(color1.h - color2.h)
	const hDiff = Math.min(angleDiff, 360 - angleDiff)
	if ((sDiff + lDiff) < 500 / hDiff) {
		return false
	}
	// colors are different if all 3 dimensions add up to a significant distance
	const diff = hDiff / 3.6 + sDiff + lDiff
	return diff > 30
}

// Luminance math: https://stackoverflow.com/questions/596216/formula-to-determine-perceived-brightness-of-rgb-color
function sRGBtoLin(colorChannel: number) {
	// Send this function a decimal sRGB gamma encoded color value
	// between 0.0 and 1.0, and it returns a linearized value.
	if ( colorChannel <= 0.04045 ) {
		return colorChannel / 12.92
	} else {
		return Math.pow((( colorChannel + 0.055)/1.055), 2.4)
	}
}
function YtoLstar(Y: number) {
	// Send this function a luminance value between 0.0 and 1.0,
	// and it returns L* which is "perceptual lightness"
	if ( Y <= (216/24389)) {   // The CIE standard states 0.008856 but 216/24389 is the intent for 0.008856451679036
		return Y * (24389/27)   // The CIE standard states 903.3, but 24389/27 is the intent, making 903.296296296296296
	} else {
		return Math.pow(Y,(1/3)) * 116 - 16
	}
}
function rbgToLum(r: number, g: number, b: number) {
	return YtoLstar(.2126 * sRGBtoLin(r) + .7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b))
}

function convertRGBtoHSL (pixel: RGBPixel): HSLPixel {
	// https://www.had2know.org/technology/hsl-rgb-color-converter.html (from loaded .js, not from explanation)
	const r = pixel.r / 255
	const g = pixel.g / 255
	const b = pixel.b / 255
	const lum = rbgToLum(r, g, b)

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const delta = max - min

	const l = (max + min) / 2

	if (delta < 2 / 255) {
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
	} else {
		h = (4 + (r - g) / delta) / 6
	}

	return {
		h: Math.round(360 * h),
		s: s * 100,
		l: l * 100,
		lum,
	}
}

type FormattedHSL = {h: number, s: number, l: number}

function formatHSL({h = 0, s = 0, l = 0}: {h?: number, s?: number, l?:number} = {}): FormattedHSL {
	return {
		h,
		s: Number(s.toFixed(2)),
		l: Number(l.toFixed(2)),
	}
}

export type PaletteDefinition = [FormattedHSL, FormattedHSL, FormattedHSL, FormattedHSL]

export default function extractPaletteFromUint8(data: Uint8ClampedArray, channels: 3 | 4 = 4) {
	const main = extractPalette(data, channels)
	const palette = main.map(formatHSL) as PaletteDefinition
	return palette
}