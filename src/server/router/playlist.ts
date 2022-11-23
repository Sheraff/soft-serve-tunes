import { createRouter } from "./context"
import { z } from "zod"
import { zTrackTraits } from "./track"

const trackInclude = {
  artist: {
    select: {
      id: true,
      name: true,
    },
  },
  album: {
    select: {
      id: true,
      name: true,
    },
  }
} // satisfies Prisma.TrackFindManyArgs['include']

export const playlistRouter = createRouter()
  .query("generate", {
    input: z.union([
      z.object({
        type: z.enum(['track', 'artist', 'album', 'genre']),
        id: z.string(),
      }),
      z.object({
        type: z.enum(['by-trait']),
        trait: zTrackTraits,
        order: z.union([
          z.literal("desc"),
          z.literal("asc"),
        ]),
      })
    ]),
    async resolve({ input, ctx }) {
      if (input.type === 'track') {
        return ctx.prisma.track.findMany({
          where: { id: input.id },
          include: trackInclude,
        })
      }
      if (input.type === 'artist') {
        return ctx.prisma.track.findMany({
          where: { artistId: input.id },
          orderBy: [
            { albumId: 'asc' },
            { position: 'asc' },
          ],
          include: trackInclude,
        })
      }
      if (input.type === 'album') {
        return ctx.prisma.track.findMany({
          where: { albumId: input.id },
          orderBy: { position: 'asc' },
          include: trackInclude,
        })
      }
      if (input.type === 'genre') {
        return ctx.prisma.track.findMany({
          where: { genres: { some: { id: input.id } } },
          include: trackInclude,
        })
      }
      if (input.type === 'by-trait') {
        return ctx.prisma.track.findMany({
          where: { spotify: { [input.trait]: { gt: 0 } } },
          orderBy: { spotify: { [input.trait]: input.order } },
          take: 30,
          include: trackInclude,
        })
      }
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.playlist.findMany()
    }
  })
