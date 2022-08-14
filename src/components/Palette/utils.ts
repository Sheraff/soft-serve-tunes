type RGBPixel = {
	r: number
	g: number
	b: number
}

type HSLPixel = {
	h: number
	s: number
	l: number
}

export function buildRgb (imageData: ImageData['data']) {
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

export function test(values: RGBPixel[]) {
	const colors = values.reduce((prev, curr) => {
		prev[curr.r + ',' + curr.g + ',' + curr.b] = (prev[curr.r + ',' + curr.g + ',' + curr.b] || 0) + 1
		return prev
	} , {} as {[key: string]: number})
	const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1])
	const aggregateSimilar = sorted.reduce((prev, [string, count]) => {
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
	return aggregateSimilar
		.sort((a, b) => b[1] - a[1])
		.slice(0, 4)
		.map(([color, count]) => color)
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
	const hDiff = Math.abs(color1.h - color2.h)
	if ((sDiff + lDiff) < 500 / hDiff) {
		return false
	}
	const diff = hDiff / 360 + sDiff / 100 + lDiff / 100
	return diff > 0.3
}

function findBiggestColorRange(values: RGBPixel[]): keyof RGBPixel {
	const first = values[0]
	if (!first) {
		throw new Error('No values provided')
	}
	const keys = ['r', 'g', 'b'] as const
	const mins = Object.fromEntries(keys.map(key => [key, Number.MAX_VALUE]))
	const maxs = Object.fromEntries(keys.map(key => [key, Number.MIN_VALUE]))
	

	values.forEach((value) => {
		keys.forEach((key) => {
			mins[key] = Math.min(mins[key] as number, value[key] as number)
			maxs[key] = Math.max(maxs[key] as number, value[key] as number)
		})
	})

	const ranges = keys.map((key) => (maxs[key] as number) - (mins[key] as number))

	// determine which color has the biggest difference
	const max = Math.max(...ranges)
	const maxIndex = ranges.indexOf(max)
	return keys[maxIndex] as keyof RGBPixel
}

function averageColor(values: RGBPixel[]): RGBPixel {
	const color = values.reduce(
		(prev, curr) => {
			prev.r += curr.r
			prev.g += curr.g
			prev.b += curr.b

			return prev;
		},
		{
			r: 0,
			g: 0,
			b: 0,
		}
	)

	color.r = Math.round(color.r / values.length)
	color.g = Math.round(color.g / values.length)
	color.b = Math.round(color.b / values.length)

	return color
}

export function quantization (rgbValues: RGBPixel[], depth: number, MAX_DEPTH = 4): RGBPixel[] {
	// Base case
	if (depth === MAX_DEPTH || rgbValues.length === 0) {
		return [averageColor(rgbValues)]
	}

	const componentToSortBy = findBiggestColorRange(rgbValues)
	rgbValues.sort((p1, p2) => {
		return p1[componentToSortBy] - p2[componentToSortBy]
	})

	const mid = rgbValues.length / 2
	return [
		...quantization(rgbValues.slice(0, mid), depth + 1, MAX_DEPTH),
		...quantization(rgbValues.slice(mid + 1), depth + 1, MAX_DEPTH),
	]
}

export function convertRGBtoHSL (pixel: RGBPixel): HSLPixel {
	// first change range from 0-255 to 0 - 1
	let r = pixel.r / 255
	let g = pixel.g / 255
	let b = pixel.b / 255

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)

	const difference = max - min

	const luminance = (max + min) / 2

	const saturation = luminance <= 0.5
		? difference / (max + min)
		: difference / (2 - max - min)

	if (difference === 0) {
		return {
			h: 0,
			s: 0,
			l: luminance,
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
		l: luminance * 100,
	}
}

export function averageImageValue(imageData: ImageData['data']): number {
	return imageData.reduce((prev, curr, i) => prev + (i%4 === 3 ? 0 : curr), 0) / imageData.length * 3
}

export function formatHSL({h = 0, s = 0, l = 0}: {h?: number, s?: number, l?:number} = {}): string {
	return `hsl(${h}, ${s}%, ${l}%)`
}

export function complementaryHSL({h = 0, s = 0, l = 0}: {h?: number, s?: number, l?:number} = {}): string {
	const oppositeH = (h + 120) % 360
	return `hsl(${oppositeH}, ${s}%, ${l}%)`
}