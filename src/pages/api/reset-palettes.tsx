import { readFile } from "fs/promises"
import { NextApiRequest, NextApiResponse } from "next"
import { join } from "path"
import { prisma } from "server/db/client"
import { env } from "env/server.mjs"
import { extractPalette } from "utils/writeImage"
import getServerAuth from "server/common/server-auth"

async function redoImagePalette (image: { id: string, path: string }) {
	const originalFilePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, image.path)
	try {
		const buffer = await readFile(originalFilePath)
		const palette = await extractPalette(buffer)
		if (!palette) {
			console.log("could not extract from image ", image.id, image.path)
			return
		}
		await prisma.image.update({
			where: { id: image.id },
			data: { palette }
		})
	} catch (e) {
		console.error(e)
	}
}

async function act () {
	const chunkSize = 20
	let cursor = 0
	let images: { id: string, path: string }[]
	do {
		console.log(`extracting ${chunkSize} palettes from #${cursor}`)
		images = await prisma.image.findMany({
			select: { id: true, path: true },
			skip: cursor,
			take: chunkSize,
		})
		cursor += chunkSize
		for (const image of images) {
			await redoImagePalette(image)
		}
	} while (images.length === chunkSize)
	console.log("DONE --------------------------------")
}

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
	if (!await getServerAuth(req, res)) {
		return
	}
	act()
	return res.status(200).end()
}