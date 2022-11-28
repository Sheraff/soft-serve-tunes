import type { NextApiRequest, NextApiResponse } from "next"
import { constants, createReadStream } from "node:fs"
import { join } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import sharp from "sharp"
import { access } from "node:fs/promises"
import log from "utils/logger"

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

  let returnStream: ({pipe: (res: NextApiResponse) => NextApiResponse}) | null = null
  try {
    await access(exactFilePath, constants.R_OK)
    returnStream = createReadStream(exactFilePath)
  } catch {
    const cover = await prisma.image.findUnique({
      where: { id },
      select: { path: true },
    })
    if (!cover) {
      log("error", "404", "sharp", `${width}x${width} cover #${id}`)
      return res.status(404).json({ error: "Cover not found" })
    }
    const originalFilePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
    try {
      await access(originalFilePath, constants.R_OK)
      log("event", "gen", "sharp", `${width}x${width} cover ${cover.path}`)
      const transformStream = sharp(originalFilePath)
        .resize(width, width, {
          fit: 'cover',
          withoutEnlargement: true,
          fastShrinkOnLoad: false,
        })
        .toFormat('avif')
      // store
      transformStream
        .clone()
        .toFile(exactFilePath)
        .then(() => log("ready", "200", "sharp", `${width}x${width} cover ${cover.path}`))
      // respond
      returnStream = transformStream
    } catch {
      log("error", "500", "sharp", `no such file: cover #${id} @ ${cover.path}`)
      removeImageEntry(id)
      return res.status(404).json({ error: "Cover not found" })
    }
  }
  if (returnStream === null) {
    log("error", "500", "sharp", `${width}x${width} cover #${id}`)
    return res.status(500).json({ error: "Error transforming image" })
  }

  res
    .setHeader("Content-Type", "image/avif")
    .setHeader("Cache-Control", "public, max-age=31536000")
  return returnStream
    .pipe(res)
    .on('error', (error: NodeJS.ErrnoException) => {
      res.status(500).json({ error })
      res.end()
    })
}

async function removeImageEntry(id: string) {
  // TODO: this is annoying to do and not exhaustive...
  // computing which image is associated with any entity should be its own function and store de result in database on the entity itself
  // so that we can easily re-trigger said computation, and invalidate client caches precisely
  const image = await prisma.image.delete({
    where: { id },
    // select: {
    //   track: {select: {id: true}},
    //   lastfmAlbum: {select: {entityId: true}},
    //   lastfmArtist: {select: {entityId: true}},
    //   spotifyArtist: {select: {artistId: true}},
    //   spotifyAlbum: {select: {albumId: true}},
    // }
  })
  log("warn", "500", "sharp", `deleted entry for file: cover #${id}`)
}