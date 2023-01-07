import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { listAlbumCovers, listTrackCovers } from "server/db/computeCover"
import { join } from "node:path"
import { env } from "env/server.mjs"
import sharp from "sharp"
import { prisma } from "server/db/client"

async function coverData(id: string) {
    const cover = await prisma.image.findUnique({
      where: {id},
      select: {id: true, palette: true, path: true},
    })
    if (!cover) return
    
    const fullPath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
    const metadata = await sharp(fullPath).metadata()
    return {
      id: cover.id,
      palette: cover.palette,
      width: metadata.width,
      height: metadata.height,
    }
}

const byId = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input }) => {
  const data = await coverData(input.id)
  return data
})

const fromTracks = publicProcedure.input(z.object({
  ids: z.array(z.string()),
})).query(async ({ input, ctx }) => {
  const covers = new Set<string>()
  for (const id of input.ids) {
    const trackCovers = await listTrackCovers(id, {album: true})
    trackCovers.forEach((c) => covers.add(c))
  }
  
  const results: Exclude<Awaited<ReturnType<typeof coverData>>, undefined>[] = []
  for (const id of covers) {
    const data = await coverData(id)
    if (data) results.push(data)
  }

  return {
    covers: results
  }
})

const fromAlbums = publicProcedure.input(z.object({
  ids: z.array(z.string()),
})).query(async ({ input }) => {
  const covers = new Set<string>()
  for (const id of input.ids) {
    const albumCovers = await listAlbumCovers(id, {tracks: true})
    albumCovers.forEach((c) => covers.add(c))
  }

  const results: Exclude<Awaited<ReturnType<typeof coverData>>, undefined>[] = []
  for (const id of covers) {
    const data = await coverData(id)
    if (data) results.push(data)
  }

  return {
    covers: results
  }
})

export const coverRouter = router({
  byId,
  fromAlbums,
  fromTracks,
})
