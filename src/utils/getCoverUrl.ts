import { env } from "env/client.mjs"

type Size =
	| "full" // full screen, mostly for panel covers
	| "half" // half screen, mostly for album lists
	| "third" // third screen, mostly for artist lists
	| "mini" // thumbnail

const dpi = env.NEXT_PUBLIC_MAIN_DEVICE_DENSITY
const baseScreenSize = env.NEXT_PUBLIC_MAIN_DEVICE_WIDTH

const sizes = {
	half: (baseScreenSize - 3 * 8) / 2 - 10,
	third: (baseScreenSize - 4 * 8) / 3,
	mini: 56,
}

export function getCoverUrl (
	coverId: string | null | undefined,
	size: Size
) {
	if (!coverId) return ""
	if (size === "full") return `/api/cover/${coverId}`
	return `/api/cover/${coverId}/${Math.round(sizes[size] * dpi)}`
}