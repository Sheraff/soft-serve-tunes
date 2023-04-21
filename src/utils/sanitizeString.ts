import toTitleCase from "titlecase"

export default function sanitizeString (string: string) {
	return string
		.replace(/\$/g, "s") // Ke$ha
		.replace(/ï/g, "i") // Hawaï
		.replace(/î/g, "i") // Maître Gims
		.replace(/’/g, "'")
		.replace(/[^\p{L}\p{N}\s'&]+/gu, " ") // remove all non-alphanumeric characters (any language) except for "' &"
		.replace(/\s+/g, " ") // concatenate consecutive spaces
		.trim()
}

export function simplifiedName (name: string) {
	const removeThe = name.replace(/\bthe\b/gi, "").replace(/\s+/g, "")
	const noEmpty = removeThe || name
	return sanitizeString(noEmpty).toLowerCase().replace(/\s+/g, "")
}

const USELESS_GENRES = new Set([
	"other",
])
const GENRES_MAP = new Map([
	["films", "soundtrack"],
	["games", "soundtrack"],
	["ost", "soundtrack"],
	["filmscores", "soundtrack"],
	["frenchsoundtrack", "soundtrack"],
	["rockfunk", "funk rock"],
	["altrock", "alternative rock"],
	["alternative", "alternative rock"],
	["indie", "indie rock"],
	["rnb", "r&b"],
])
const GENRE_REPLACERS = [
	["hip-hop", "hip hop"],
	["'n'", "&"],
	[/\balt\b/g, "alternative"],
] as const

export function cleanGenreList (genres: string[]) {
	const names = genres.flatMap((genre) => genre.split(/\/|,|;|\|/))

	const uniqueSimplifiedNames = new Set<string>()

	const filteredGenres = names.reduce<{
		simplified: string
		name: string
	}[]>((list, genreString) => {
		const lowercaseString = genreString.toLowerCase()
		const names = lowercaseString.split(/\/|,|;|\|/)
		for (const baseName of names) {
			const replacedName = GENRE_REPLACERS.reduce((name, [from, to]) => {
				return name.replaceAll(from, to)
			}, baseName)
			const replacedSimplified = simplifiedName(replacedName)

			const mapped = GENRES_MAP.get(replacedSimplified)
			const simplified = mapped ? simplifiedName(mapped) : replacedSimplified

			if (USELESS_GENRES.has(simplified)) continue
			if (uniqueSimplifiedNames.has(simplified)) continue

			const mappedName = mapped || replacedName.trim()
			const name = toTitleCase(mappedName)
				.replaceAll(/&[a-z]/g, char => char.toUpperCase())

			uniqueSimplifiedNames.add(simplified)
			list.push({ simplified, name })
		}
		return list
	}, [])

	return filteredGenres
}