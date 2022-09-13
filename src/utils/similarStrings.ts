import damLev from "components/Header/Search/worker/damLev"
import sanitizeString from "./sanitizeString"

function comparable(name: string) {
	return sanitizeString(name).toLowerCase().replace(/\s+/g, '')
}

export default function similarStrings(a: string, b: string) {
	const _a = comparable(a)
	const _b = comparable(b)

	if (_a === _b) return true

	const distance = damLev(_a, _b)
	const refLength = Math.max(_a.length, _b.length)
	const ratio = distance / refLength
	return ratio < 0.07 || (ratio < 0.5 && distance < 4)
}