export const COVER_SIZES = {
	// full screen, mostly for panel covers
	full: (viewport: number) => viewport,
	// half screen, mostly for album lists
	half: (viewport: number) => (viewport - 3 * 8) / 2 - 10,
	// third screen, mostly for artist lists
	third: (viewport: number) => (viewport - 4 * 8) / 3,
	// thumbnail
	mini: () => 56,
} as const

export function getCoverUrl (
	coverId: string | null | undefined,
	size: keyof typeof COVER_SIZES
) {
	if (!coverId) return ""
	return `/api/cover/${coverId}?${size}`
}