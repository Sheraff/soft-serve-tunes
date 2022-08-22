import { env } from "env/server.mjs"

const deviceWidth = Math.round(env.MAIN_DEVICE_WIDTH * env.MAIN_DEVICE_DENSITY)

export default function lastfmImageToUrl(image: string, size = deviceWidth) {
	const sizeRegex = /\/i\/u\/([^\/]*)\//
	const src = image.replace(sizeRegex, `/i/u/${size}x${size}/`)
	return src
}