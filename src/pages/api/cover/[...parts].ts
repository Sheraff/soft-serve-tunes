import type { NextApiRequest, NextApiResponse } from "next"
import { constants, createReadStream } from "node:fs"
import { join } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import sharp from "sharp"
import { access, stat, unlink } from "node:fs/promises"
import log from "utils/logger"
import Queue from "utils/Queue"
import {
  computeAlbumCover,
  computeTrackCover,
  computeArtistCover,
} from "server/db/computeCover"

const deviceWidth = env.NEXT_PUBLIC_MAIN_DEVICE_WIDTH * env.NEXT_PUBLIC_MAIN_DEVICE_DENSITY

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type
const queue = (globalThis.sharpQueue || new Queue(0)) as InstanceType<typeof Queue>
// @ts-expect-error -- see above
globalThis.sharpQueue = queue

const runningTransforms = new Set<string>()

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
  const { parts } = req.query
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
  const extensionLess = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, ".meta", a, b, c, id) // this is how images are stored

  const width = Math.min(deviceWidth, Math.round(dimension ? Number(dimension) : deviceWidth))
  const exactFilePath = `${extensionLess}_${width}x${width}.avif`

  let returnStream: ({ pipe: (res: NextApiResponse) => NextApiResponse }) | null = null
  let etag: string | undefined
  try {
    const stats = await stat(exactFilePath)
    etag = stats.ino.toString()

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end()
    }

    if (stats.size === 0) {
      if (runningTransforms.has(exactFilePath)) {
        log("warn", "weird", "sharp", `${width}x${width} cover #${id} is 0 bytes but is being generated (${exactFilePath})`)
      } else {
        log("error", "500", "sharp", `${width}x${width} cover #${id} is 0 bytes and is not being generated (${exactFilePath})`)
      }
      throw new Error(`Transformed file is 0 bytes, switch to streaming transform (${exactFilePath})`)
    }

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
      await queue.next()
      const stats = await stat(originalFilePath)

      if (stats.size === 0) {
        throw new Error(`Original file is 0 bytes (${originalFilePath})`)
      }

      log("event", "gen", "sharp", `${width}x${width} cover ${cover.path}`)
      const transformStream = sharp(originalFilePath)
        .resize(width, width, {
          fit: "cover",
          withoutEnlargement: true,
          fastShrinkOnLoad: false,
        })
        .toFormat("avif")

      // store
      if (!runningTransforms.has(exactFilePath)) {
        runningTransforms.add(exactFilePath)
        transformStream
          .clone()
          .toFile(exactFilePath)
          .then(() => {
            log("ready", "200", "sharp", `${width}x${width} cover ${cover.path}`)
          })
          .catch((error) => {
            log("error", "500", "sharp", `Failed during transform ${width}x${width} cover ${cover.path}`)
            console.error(error)
          })
          .finally(() => {
            runningTransforms.delete(exactFilePath)
          })
      }

      // respond
      returnStream = transformStream
    } catch (e) {
      log("error", "500", "sharp", `no such file: cover #${id} @ ${cover.path}`)
      console.error(e)
      removeImageEntry(id)
      return res.status(404).json({ error: "Cover not found" })
    }
  }
  if (returnStream === null) {
    log("error", "500", "sharp", `${width}x${width} cover #${id}`)
    return res.status(500).json({ error: "Error transforming image" })
  }
  if (!etag) {
    /**
     * if there is no etag yet it means the file is being generated
     * as we're streaming the response, so we don't have the definitive
     * file stats yet. Because this is slow, interruptions are likely and
     * result in a corrupted cached file. To avoid this, we generate a
     * random etag that will be replaced once the file is ready.
     */
    etag = Date.now().toString() + Math.random().toString()
  }

  res
    .setHeader("Content-Type", "image/avif")
    .setHeader("Cache-Control", "max-age=604800, stale-while-revalidate=31536000") // keep for 1 week, revalidate 1 year
    .setHeader("ETag", etag)
  return returnStream
    .pipe(res)
    .on("error", (error: NodeJS.ErrnoException) => {
      res.status(500).json({ error })
      res.end()
    })
}

export async function removeImageEntry (id: string) {
  const tracks = await prisma.track.findMany({
    where: { coverId: id },
  })
  const albums = await prisma.album.findMany({
    where: { coverId: id },
  })
  const artists = await prisma.artist.findMany({
    where: { coverId: id },
  })
  const cover = await prisma.image.delete({
    where: { id },
    select: { path: true },
  })
  for (const track of tracks) {
    await computeTrackCover(track.id, { album: false, artist: false })
  }
  for (const album of albums) {
    await computeAlbumCover(album.id, { artist: false, tracks: true })
  }
  for (const artist of artists) {
    await computeArtistCover(artist.id, { album: false, tracks: false })
  }
  try {
    const originalFilePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
    await unlink(originalFilePath)
  } catch { }
  log("warn", "500", "sharp", `deleted entry for file: cover #${id} (${cover.path})`)
}