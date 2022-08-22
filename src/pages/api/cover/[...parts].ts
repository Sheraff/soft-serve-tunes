import type { NextApiRequest, NextApiResponse } from "next"
import { constants, createReadStream, ReadStream } from "node:fs"
import { join } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import sharp from "sharp"
import { access } from "node:fs/promises"

const deviceWidth = env.MAIN_DEVICE_WIDTH * env.MAIN_DEVICE_DENSITY

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
  const {parts} = req.query
  if (!parts) {
    return res.status(400).json({ error: "Missing path" })
  }
  const [id, dimension] = Array.isArray(parts) ? parts : [parts]
  if (!id) {
    return res.status(400).json({ error: "Missing id" })
  }

  const [a, b, c] = id
  if (!a || !b || !c) {
    return res.status(400).json({ error: "Invalid id" })
  }
  const extensionLess = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, '.meta', a, b, c, id) // this is how images are stored

  const width = Math.round(dimension ? Number(dimension) : deviceWidth)
  const exactFilePath = `${extensionLess}_${width}x${width}.avif`

  let returnStream: ReadStream | NextApiResponse | null = null
  try {
    await access(exactFilePath, constants.R_OK)
    const exactStream = createReadStream(exactFilePath)
    exactStream.pipe(res)
    returnStream = exactStream
  } catch {
    const cover = await prisma.image.findUnique({
      where: { id },
      select: { path: true },
    })
    if (!cover) {
      return res.status(404).json({ error: "Cover not found" })
    }
    const originalFilePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
    const transformStream = sharp(originalFilePath)
      .resize(width, width, {
        fit: 'cover',
        withoutEnlargement: true,
        fastShrinkOnLoad: false,
      })
      .toFormat('avif')
    // respond
    returnStream = transformStream
      .clone()
      .pipe(res)
    // store
    transformStream
      .clone()
      .toFile(exactFilePath)
  }
  if (returnStream === null) {
    return res.status(500).json({ error: "Error transforming image" })
  }
  res
    .status(200)
    .setHeader("Content-Type", "image/avif")
    .setHeader("cache-control", "public, max-age=31536000")
  return returnStream
}