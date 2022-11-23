export default function sanitizeString(string: string) {
	return string
		.replace(/\$/g, 's') // Ke$ha
		.replace(/’/g, "'")
		.replace(/[^\p{L}\p{N}\s'&]+/gu, ' ') // remove all non-alphanumeric characters (any language) except for "' &"
		.replace(/\s+/g, ' ') // concatenate consecutive spaces
		.trim()
}

export function simplifiedName(name: string) {
	const removeThe = name.replace(/\bthe\b/gi, '').replace(/\s+/g, '')
	const noEmpty = removeThe || name
	return sanitizeString(noEmpty).toLowerCase().replace(/\s+/g, '')
}