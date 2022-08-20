import extractPaletteFromUint8 from "../../utils/paletteExtraction"

onmessage = (e) => {
	const data = e.data as {
		imageData: ImageData,
		src: string,
	}
	const {imageData, src} = data
	const palette = extractPaletteFromUint8(imageData.data)
	postMessage({palette, src})
}

export {} // for the compiler