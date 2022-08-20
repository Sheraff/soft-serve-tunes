import type { NextApiRequest, NextApiResponse } from "next"
import { constants, createReadStream, ReadStream } from "node:fs"
import { basename, dirname, extname, join } from "node:path"
import { env } from "../../../env/server.mjs"
import { prisma } from "../../../server/db/client"
import sharp from "sharp"
import { access } from "node:fs/promises"
import extractPaletteFromUint8 from "../../../utils/paletteExtraction"

const deviceWidth = env.MAIN_DEVICE_WIDTH * env.MAIN_DEVICE_DENSITY

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
  const {parts} = req.query
  if (!parts) {
    return res.status(400).json({ error: "Missing id" })
  }
  const [id, dimension = "750"] = Array.isArray(parts) ? parts : [parts]
  if (!id) {
    return res.status(400).json({ error: "Missing id" })
  }
  const width = dimension ? Number(dimension) : deviceWidth
  const cover = await prisma.image.findUnique({
    where: { id },
    select: { path: true, mimetype: true },
  })
  if (!cover) {
    return res.status(404).json({ error: "Cover not found" })
  }
  const originalFilePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
  const extensionLess = `${dirname(originalFilePath)}/${basename(originalFilePath, extname(originalFilePath))}`
  const exactFilePath = `${extensionLess}_${width}x${width}.avif`
  let returnStream: ReadStream | NextApiResponse | null = null
  try {
    await access(exactFilePath, constants.R_OK)
    const exactStream = createReadStream(exactFilePath)
    exactStream.pipe(res)
    returnStream = exactStream
  } catch {
    const fileStream = sharp(originalFilePath)
    const transformStream = fileStream.clone()
      .resize(width, width, {
        fit: 'cover',
        withoutEnlargement: true,
        fastShrinkOnLoad: false,
      })
      .toFormat('avif')

      returnStream = transformStream.clone().pipe(res)

      transformStream.clone().toFile(exactFilePath)
      const paletteStream = fileStream.clone()
      paletteStream
        .resize(300, 300, {
          fit: 'cover',
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
        })
        .extract({
          top: Math.round(15),
          left: Math.round(15),
          width: Math.round(270),
          height: Math.round(270),
        })
        .raw({depth: 'uchar'})
        .toBuffer({ resolveWithObject: true }).then(({data, info}) => {
          if (info.channels !== 3 && info.channels !== 4) {
            return
          }
          const array = Uint8ClampedArray.from(data)
          console.log(array)
          console.log(data.length, info)
          const palette = extractPaletteFromUint8(array, info.channels)
          console.log(palette)
        })
  } finally {
    if (returnStream === null) {
      return res.status(500).json({ error: "Error transforming image" })
    }
    res
      .status(200)
      .setHeader("Content-Type", "image/avif")
      .setHeader("cache-control", "public, max-age=31536000")
    return returnStream
  }
}