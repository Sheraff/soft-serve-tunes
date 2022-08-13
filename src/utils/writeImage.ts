import crypto from "node:crypto"
import { access, constants, writeFile } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, extname, join } from "node:path"
import { env } from "../env/server.mjs"
import { prisma } from "../server/db/client"

export async function writeImage(buffer: Buffer, extension: string = 'jpg') {
	const hash = crypto.createHash('md5').update(buffer).digest('hex') as string & {0: string, 1: string, 2: string, 3: string, 4: string, length: 32}
	const fileName = `${hash}${extension.startsWith('.') ? '' : '.'}${extension}`
	const imagePath = join('.meta', hash[0], hash[1], hash[2], fileName)
	const existingImage = await prisma.image.findUnique({where: {id: hash}})
	if (!existingImage) {
		const fullPath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, imagePath)
		const dir = dirname(fullPath)
		access(dir, constants.F_OK, async (error) => {
			if (error && error.code === 'ENOENT') {
				await mkdir(dirname(fullPath), { recursive: true })
			}
			writeFile(fullPath, buffer, {flag: 'wx'}, (error) => {
				if (error && error.code !== 'EEXIST') {
					console.warn('Error writing image', error)
				}
			})
		})
	}
	return {
		hash,
		path: imagePath,
		exists: Boolean(existingImage),
	}
}

export async function fetchAndWriteImage(url?: string) {
	if (url) {
		try {
			const response = await fetch(url)
			const mimetype = response.headers.get('content-type') ?? 'image/*'
			const buffer = await response.arrayBuffer()
			const extension = extname(url) || undefined
			const result = await writeImage(Buffer.from(buffer), extension)
			return {
				mimetype,
				...result,
			}
		} catch {}
	}
	return {
		mimetype: '',
		hash: '',
		path: '',
		exists: undefined,
	}
}