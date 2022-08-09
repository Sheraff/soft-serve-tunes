import { createRouter } from "./context"
import { z } from "zod"
import { Prisma } from "@prisma/client"

const trackInclude: Prisma.TrackInclude = {
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
  },
  genres: {
    select: {
      id: true,
      name: true,
    }
  }
}

export const playlistRouter = createRouter()
  .query("generate", {
    input: z
      .object({
        type: z.string().refine((type) => ['track', 'artist', 'album', 'genre'].includes(type)),
        id: z.string(),
      }),
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
          orderBy: { year: 'desc' },
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
    },
  })

