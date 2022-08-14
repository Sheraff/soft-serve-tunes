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

function sortByIncreasingContrastRatio([ref, ...colors]: [HSLPixel, ...HSLPixel[]]) {
	colors.sort((a, b) => {
		const contrastRatioA = contrastRatio(ref.lum, a.lum)
		const contrastRatioB = contrastRatio(ref.lum, b.lum)
		return contrastRatioB - contrastRatioA
	})
	return [ref, ...colors]
}

function contrastRatio(lum1: number, lum2: number) {
	const ratio = (lum1 + 0.05) / (lum2 + 0.05)
	return ratio
}

function buildRgb (imageData: ImageData['data']) {
	const rgbValues = [] as RGBPixel[]
	for (let i = 0; i < imageData.length - 3; i += 4) {
		const rgb = {
			r: imageData[i] as number,
			g: imageData[i + 1] as number,
			b: imageData[i + 2] as number,
		};

		rgbValues.push(rgb)
	}
	return rgbValues
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
		.map(([color]) => color)

	// TODO: will be an issue if `mainColors.length < 4`
	const byContrast = sortByIncreasingContrastRatio(mainColors)

	const lumSumAndCount = aggregateSimilar.reduce(([sum, total], [color, count]) => ([
		sum + color.lum * count,
		total + count
	]), [0, 0] as [number, number])
	const avgLum = lumSumAndCount[0] / lumSumAndCount[1]
	if(avgLum > 0.7) {
		byContrast.reverse()
	}

	return byContrast
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
	// first change range from 0-255 to 0 - 1
	let r = pixel.r / 255
	let g = pixel.g / 255
	let b = pixel.b / 255

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)

	const difference = max - min

	const lightness = (max + min) / 2

	const saturation = lightness <= 0.5
		? difference / (max + min)
		: difference / (2 - max - min)

	const luminance = .2126 * channelLuminance(r) + .7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)

	if (difference === 0) {
		return {
			h: 0,
			s: 0,
			l: lightness,
			lum: luminance,
		}
	}
	/**
	 * If Red is max, then Hue = (G-B)/(max-min)
	 * If Green is max, then Hue = 2.0 + (B-R)/(max-min)
	 * If Blue is max, then Hue = 4.0 + (R-G)/(max-min)
	 */
	let hue = 0
	const maxColorValue = Math.max(pixel.r, pixel.g, pixel.b);
	if (maxColorValue === pixel.r) {
		hue = (g - b) / difference;
	} else if (maxColorValue === pixel.g) {
		hue = 2.0 + (b - r) / difference;
	} else {
		hue = 4.0 + (g - b) / difference;
	}
	hue = Math.round(hue * 60) // convert to degrees
	if (hue < 0) {
		hue = hue + 360
	}

	return {
		h: hue,
		s: saturation * 100,
		l: lightness * 100,
		lum: luminance,
	}
}

function formatHSL({h = 0, s = 0, l = 0}: {h?: number, s?: number, l?:number} = {}): string {
	return `hsl(${h}, ${s}%, ${l}%)`
}

onmessage = (e) => {
	const data = e.data as {
		imageData: ImageData,
	}
	const {imageData} = data
	const rgbArray = buildRgb(imageData.data)
	const main = extractPalette(rgbArray)
	const palette = main.map(formatHSL)
	postMessage({palette})
}

export {} // for the compiler