import { createRouter } from "./context"
import { z } from "zod"
import { zTrackTraits } from "./track"
import { TRPCError } from "@trpc/server"
import { socketServer } from "server/persistent/ws"

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
          where: {
            spotify: { [input.trait]: { gt: 0 } },
            file: { duration: { gt: 30 } },
          },
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
  .query("get", {
    input: z.object({
      id: z.string()
    }),
    async resolve({ input, ctx }) {
      return ctx.prisma.playlist.findUnique({
        where: { id: input.id },
        include: {
          tracks: {
            include: { track: true },
            orderBy: { index: 'asc' },
          }
        }
      })
    }
  })
  .mutation("save", {
    input: z.object({
      name: z.string(),
      tracks: z.array(z.object({
        id: z.string(),
        index: z.number(),
      }))
    }),
    async resolve({ input, ctx }) {
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" })
      }
      const playlist = await ctx.prisma.playlist.create({
        data: {
          name: input.name,
          tracks: { create: input.tracks.map(({id, index}) => ({
            index,
            trackId: id,
          }))}
        },
        include: {
          tracks: {
            include: { track: true },
            orderBy: { index: 'asc' },
          }
        }
      })
      socketServer.send("watcher:add-playlist")
      return playlist
    }
  })
  .mutation("delete", {
    input: z.object({
      id: z.string()
    }),
    async resolve({ input, ctx }) {
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" })
      }
      const [,playlist] = await ctx.prisma.$transaction([
        ctx.prisma.playlistEntry.deleteMany({
          where: { playlistId: input.id },
        }),
        ctx.prisma.playlist.delete({
          where: { id: input.id },
          select: { id: true },
        }),
      ])
      socketServer.send('watcher:remove-playlist', { playlist })
      return playlist
    }
  })
