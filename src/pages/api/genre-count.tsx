import { readFile } from "fs/promises"
import { NextApiRequest, NextApiResponse } from "next"
import { join } from "path"
import { prisma } from "server/db/client"
import { env } from "env/server.mjs"
import { extractPalette } from "utils/writeImage"

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
	const genres = await prisma.genre.findMany({
		where: {
			tracks: { some: {} },
			OR: [
				{ subgenres: { some: {} } },
				{ supgenres: { some: {} } },
			]
		},
		select: {
			name: true,
			_count: {
				select: {
					tracks: true,
				}
			},
			subgenres: {
				select: {
					name: true,
				}
			},
			supgenres: {
				select: {
					name: true,
				}
			}
		}
	})
	genres.forEach(genre => {
		genre.subgenres = genre.subgenres.map(subgenre => subgenre.name).join(", ")
		genre.supgenres = genre.supgenres.map(supgenre => supgenre.name).join(", ")
	})
	const total = await prisma.genre.count()
	return res.status(200).json({ genres, count: genres.length, total })
}