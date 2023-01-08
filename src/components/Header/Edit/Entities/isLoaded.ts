export default function isLoaded<T>(tracks: (T | undefined)[], isLoading: boolean): tracks is T[] {
	return !isLoading
}