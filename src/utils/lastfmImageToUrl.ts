export default function lastfmImageToUrl(image: string, size = 500) {
	const sizeRegex = /\/i\/u\/([^\/]*)\//
	const src = image.replace(sizeRegex, `/i/u/${size}x${size}/`)
	return src
}