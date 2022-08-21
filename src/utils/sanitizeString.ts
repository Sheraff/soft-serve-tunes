export default function sanitizeString(string: string) {
	return string
		.replace(/\$/g, 's') // exception because music titles are funky
		.replace(/[^\p{L}\p{N}\s']+/gu, ' ') // remove all non-alphanumeric characters (any language) except for "' "
		.replace(/\s+/g, ' ') // concatenate consecutive spaces
		.trim()
}