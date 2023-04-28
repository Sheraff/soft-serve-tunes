import { NextApiRequest, NextApiResponse } from "next"
import { getServerAuthSession } from "server/common/get-server-auth-session"
import { prisma } from "server/db/client"
import { cleanGenreList } from "utils/sanitizeString"

const MB_GENRE_HIERARCHY = {
	"has fusion genres": "subgenres",
	"fusion of": "supgenres",
	"subgenres": "subgenres",
	"subgenre of": "supgenres",
	// "influenced genres": "subgenres",
	// "influenced by": "supgenres",
} as const

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerAuthSession({ req, res })
	if (!session) {
		return res.status(401).json({ error: "authentication required" })
	}
	const origin = await fetch("https://musicbrainz.org/genres")
	const indexData = await origin.text()

	const re = /<a href="\/genre\/([a-z0-9-]+)"><bdi>([^<]+)/gim
	let match: RegExpExecArray | null = null
	while (match = re.exec(indexData)) {
		const parsed = cleanGenreList([unescapeHTML(match[2]!)])
		if (parsed.length !== 1) {
			console.error("invalid parsed genre list")
			console.log(parsed)
			continue
		}
		const item: {
			name: string
			simplified: string
			id: string
			subgenres: { name: string, simplified: string, id: string }[]
			supgenres: { name: string, simplified: string, id: string }[]
		} = {
			name: parsed[0]!.name,
			simplified: parsed[0]!.simplified,
			id: match[1]!,
			subgenres: [],
			supgenres: [],
		}
		await new Promise((r) => setTimeout(r, 1_000))
		const page = await fetch(`https://musicbrainz.org/genre/${item.id}`)
		const pageData = await page.text()

		// A has fusion genres B ===> A parent B
		// A fusion of B ===> A child B
		// A subgenres B ===> A parent B
		// A subgenre of B ===> A child B
		// A influenced genres B ===> A parent B
		// A influenced by B ===> A child B
		const sectionRegex = new RegExp(`<th>(${Object.keys(MB_GENRE_HIERARCHY).join("|")}):<\/th><td.*?>(.*?)<\/td>`, "gim")
		let sectionMatch: RegExpExecArray | null = null
		while (sectionMatch = sectionRegex.exec(pageData)) {
			const kind = MB_GENRE_HIERARCHY[sectionMatch[1] as keyof typeof MB_GENRE_HIERARCHY]

			const itemData = sectionMatch[2]!
			const itemRegex = /<a href="\/genre\/([a-z0-9-]+)"><bdi>([^<]+)/gim
			let itemMatch: RegExpExecArray | null = null
			while (itemMatch = itemRegex.exec(itemData)) {
				const parsedItemMatch = cleanGenreList([unescapeHTML(itemMatch[2]!)])
				if (parsedItemMatch.length !== 1) {
					console.error("invalid parsedItemMatch genre list")
					console.log(parsedItemMatch)
					continue
				}
				const rel = {
					name: parsedItemMatch[0]!.name,
					simplified: parsedItemMatch[0]!.simplified,
					id: itemMatch[1]!,
				}
				item[kind].push(rel)
			}
		}

		if (item.subgenres.length === 0 && item.supgenres.length === 0) continue

		const data = await prisma.genre.upsert({
			where: { simplified: item.simplified },
			select: {
				name: true,
				subgenres: { select: { name: true } },
				supgenres: { select: { name: true } },
			},
			create: {
				name: item.name,
				simplified: item.simplified,
				subgenres: {
					connectOrCreate: item.subgenres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
				supgenres: {
					connectOrCreate: item.supgenres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
			},
			update: {
				name: item.name,
				subgenres: {
					connectOrCreate: item.subgenres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
				supgenres: {
					connectOrCreate: item.supgenres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
			}
		})

		console.log(`genre connected: ${data.name}`)
	}


	return res.status(200).end()
}


const htmlEntities = {
	nbsp: " ",
	cent: "¢",
	pound: "£",
	yen: "¥",
	euro: "€",
	copy: "©",
	reg: "®",
	lt: "<",
	gt: ">",
	quot: "\"",
	amp: "&",
	apos: "'"
} as const

function unescapeHTML (str: string) {
	return str.replace(/\&([^;]+);/g, (entity, entityCode: string) => {
		let match

		if (entityCode in htmlEntities) {
			return htmlEntities[entityCode as keyof typeof htmlEntities]
		} else if (match = entityCode.match(/^#x([\da-fA-F]+)$/)) {
			return String.fromCharCode(parseInt(match[1]!, 16))
		} else if (match = entityCode.match(/^#(\d+)$/)) {
			return String.fromCharCode(~~match[1]!)
		} else {
			return entity
		}
	})
}