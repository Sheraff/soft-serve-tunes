import damLev from "components/Header/Search/worker/damLev"
import { simplifiedName } from "./sanitizeString"

export default function similarStrings(a: string, b: string) {
	const _a = simplifiedName(a)
	const _b = simplifiedName(b)

	if (_a === _b) return true

	const distance = damLev(_a, _b)
	const refLength = Math.max(_a.length, _b.length)
	const ratio = distance / refLength
	return ratio < 0.07 || (ratio < 0.5 && distance < 4) || (ratio < 0.3 && distance < 5)
}