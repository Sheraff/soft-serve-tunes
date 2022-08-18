export default function pluralize(count: number | undefined | null) {
	if (typeof count === 'number' && count > 1) {
		return 's'
	}
	return ''
}