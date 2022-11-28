import { createRouter } from "./context"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { spotify } from "server/persistent/spotify"
import { audioDb } from "server/persistent/audiodb"
import { socketServer } from "server/persistent/ws"
import log from "utils/logger"
import { TRPCError } from "@trpc/server"
import retryable from "utils/retryable"

export const zTrackTraits = z.union([
  z.literal("danceability"), // tempo, rhythm stability, beat strength, and overall regularity
  z.literal("energy"), // fast, loud, and noisy
  z.literal("speechiness"), // talk show, audio book, poetry
  z.literal("acousticness"),
  z.literal("instrumentalness"), // instrumental tracks / rap, spoken word
  z.literal("liveness"), // performed live / studio recording
  z.literal("valence"), // happy, cheerful, euphoric / sad, depressed, angry
])

export const trackRouter = createRouter()
  .query("searchable", {
    async resolve({ ctx }) {
      return ctx.prisma.track.findMany({
        select: {
          id: true,
          name: true,
          artist: {
            select: {
              name: true,
            },
          },
          album: {
            select: {
              name: true,
            },
          },
        }
      })
    }
  })
  .query("miniature", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          position: true,
          userData: {
            select: {
              favorite: true,
            }
          },
          album: {
            select: {
              id: true,
              name: true,
            }
          },
          artist: {
            select: {
              id: true,
              name: true,
            }
          },
          cover: {
            select: {
              id: true,
              palette: true,
            }
          },
          audiodb: {
            select: {
              // intDuration: true,
              intTrackNumber: true,
            }
          },
          spotify: {
            select: {
              // durationMs: true,
              trackNumber: true,
              explicit: true,
              // discNumber: true,
            }
          },
          // lastfm: {
          //   select: {
          //     duration: true,
          //   }
          // },
        }
      })
      if (!track) return null

      if (track) {
        lastFm.findTrack(input.id)
        spotify.findTrack(input.id)
        audioDb.fetchTrack(input.id)
      } else {
        log("error", "404", "trpc", `track.miniature looked for unknown track by id ${input.id}`)
      }

      return track
    }
  })
  .mutation("playcount", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const now = new Date().toISOString()
      const track = await retryable(() => ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: { albumId: true, artistId: true },
      }))
      if (!track) return

      await ctx.prisma.$transaction([
        ctx.prisma.track.update({
          where: { id: input.id },
          data: { userData: { upsert: {
            update: { playcount: { increment: 1 }, lastListen: now },
            create: { playcount: 1, lastListen: now }
          }}}
        }),
        ...(track.albumId ? [
          ctx.prisma.album.update({
            where: { id: track.albumId },
            data: { userData: { upsert: {
              update: { playcount: { increment: 1 }, lastListen: now },
              create: { playcount: 1, lastListen: now }
            }}}
          })
        ] : []),
        ...(track.artistId ? [
          ctx.prisma.artist.update({
            where: { id: track.artistId },
            data: { userData: { upsert: {
              update: { playcount: { increment: 1 }, lastListen: now },
              create: { playcount: 1, lastListen: now }
            }}}
          })
        ] : []),
      ])

      socketServer.send("invalidate:track", {id: input.id})
      if (track.albumId)
        socketServer.send("invalidate:album", {id: track.albumId})
      if (track.artistId)
        socketServer.send("invalidate:artist", {id: track.artistId})
      if (track.albumId || track.artistId)
        socketServer.send("invalidate:listen-count")
    }
  })
  .mutation("like", {
    input: z
      .object({
        id: z.string(),
        toggle: z.boolean(),
      }),
    async resolve({ input, ctx }) {
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const track = await retryable(() => ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: { albumId: true, artistId: true },
      }))
      if (!track) return

      const kind = input.toggle ? 'increment' : 'decrement'
      const init = input.toggle ? 1 : 0
      const {albumId, artistId} = track
      await ctx.prisma.$transaction([
        ctx.prisma.track.update({
          where: { id: input.id },
          data: { userData: { upsert: {
            update: { favorite: input.toggle },
            create: { favorite: input.toggle }
          }}}
        }),
        ...(albumId ? [
          ctx.prisma.album.update({
            where: { id: albumId },
            data: { userData: { upsert: {
              update: { favorite: { [kind]: 1 } },
              create: { favorite: init }
            }}}
          })
        ] : []),
        ...(artistId ? [
          ctx.prisma.artist.update({
            where: { id: artistId },
            data: { userData: { upsert: {
              update: { favorite: { [kind]: 1 } },
              create: { favorite: init }
            }}}
          })
        ] : []),
      ])

      socketServer.send("invalidate:track", {id: input.id})
      if (albumId)
        socketServer.send("invalidate:album", {id: albumId})
      if (artistId)
        socketServer.send("invalidate:artist", {id: artistId})
      socketServer.send("invalidate:likes")

      return track
    }
  })
  .query("by-trait", {
    input: z.object({
      trait: zTrackTraits,
      order: z.union([
        z.literal("desc"),
        z.literal("asc"),
      ]),
    }),
    async resolve({ input, ctx }) {
      return ctx.prisma.track.findMany({
        where: {
          spotify: { [input.trait]: { gt: 0 } },
          file: { duration: { gt: 30 } },
        },
        orderBy: { spotify: { [input.trait]: input.order } },
        take: 5,
        include: {
          spotify: {
            select: {
              [input.trait]: true,
            }
          }
        }
      })
    }
  })
