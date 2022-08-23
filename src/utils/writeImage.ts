import crypto from "node:crypto"
import { access, constants, writeFile } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, extname, join } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import sharp from "sharp"
import extractPaletteFromUint8 from "utils/paletteExtraction"

export async function writeImage(buffer: Buffer, extension = 'jpg', url?: string) {
	const hash = crypto.createHash('md5').update(buffer).digest('hex') as string & { 0: string, 1: string, 2: string, 3: string, 4: string, length: 32 }
	const fileName = `${hash}${extension.startsWith('.') ? '' : '.'}${extension}`
	const imagePath = join('.meta', hash[0], hash[1], hash[2], fileName)
	const existingImage = await prisma.image.findUnique({ where: { id: hash } })
	let palette = existingImage?.palette || ''
	if (!existingImage) {
		const fullPath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, imagePath)
		const dir = dirname(fullPath)
		access(dir, constants.F_OK, async (error) => {
			if (error && error.code === 'ENOENT') {
				await mkdir(dirname(fullPath), { recursive: true })
			}
			writeFile(fullPath, buffer, { flag: 'wx' }, (error) => {
				if (error && error.code !== 'EEXIST') {
					console.error('Error writing image', extension, url)
					console.error(error)
				}
			})
		})
		try {
			const extracted = await extractPalette(buffer)
			if (extracted) {
				palette = JSON.stringify(extracted)
			} else {
				console.warn('Could not extract palette', extension, url)
			}
		} catch (error) {
			console.error('Error extracting palette', extension, url)
			console.error(error)
		}
	}
	return {
		hash,
		path: imagePath,
		exists: Boolean(existingImage),
		palette,
	}
}

export async function fetchAndWriteImage(url?: string, retries = 0): Promise<
	(Awaited<ReturnType<typeof writeImage>> & {mimetype: string})
	| {mimetype: '',hash: '',path: '',palette: '',exists: undefined}
> {
	if (url) {
		let step = 0
		try {
			const response = await fetch(url)
			step = 1
			const mimetype = response.headers.get('content-type') ?? 'image/*'
			step = 2
			const buffer = await response.arrayBuffer()
			step = 3
			const extension = extname(url) || undefined
			step = 4
			const result = await writeImage(Buffer.from(buffer), extension, url)
			step = 5
			return {
				mimetype,
				...result,
			}
		} catch (e) {
			console.error('Could not fetch image', url)
			console.error(`failed at step ${step}`)
			console.error(e)
			if (retries < 5) {
				await new Promise(resolve => setTimeout(resolve, 500 * (retries + 1) ** 2))
				return fetchAndWriteImage(url, retries + 1)
			}
		}
	}
	return {
		mimetype: '',
		hash: '',
		path: '',
		palette: '',
		exists: undefined,
	}
}

async function extractPalette(buffer: Buffer) {
	return sharp(buffer)
		.resize(300, 300, {
			fit: 'cover',
			fastShrinkOnLoad: true,
		})
		.extract({
			top: Math.round(300 * 0.05),
			left: Math.round(300 * 0.05),
			width: Math.round(300 * 0.9),
			height: Math.round(300 * 0.9),
		})
		.raw({ depth: 'uchar' })
		.toBuffer({ resolveWithObject: true }).then(({ data, info }) => {
			if (info.channels !== 3 && info.channels !== 4) {
				return undefined
			}
			const array = Uint8ClampedArray.from(data)
			return extractPaletteFromUint8(array, info.channels)
		})
}