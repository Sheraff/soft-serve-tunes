import { router, publicProcedure, protectedProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { spotify } from "server/persistent/spotify"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import { TRPCError } from "@trpc/server"
import retryable from "utils/retryable"
import { socketServer } from "utils/typedWs/server"
import { prisma } from "server/db/client"

export const zTrackTraits = z.union([
  z.literal("danceability"),
  z.literal("energy"),
  z.literal("speechiness"),
  z.literal("acousticness"),
  z.literal("instrumentalness"),
  z.literal("liveness"),
  z.literal("valence"),
])

const searchable = publicProcedure.query(({ ctx }) => {
  console.log("track.findMany from /trpc/track > searchable")
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
})

const miniature = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const track = await ctx.prisma.track.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      position: true,
      userData: { select: { favorite: true } },
      album: { select: { id: true, name: true } },
      artist: { select: { id: true, name: true } },
      cover: { select: { id: true, palette: true } },
      spotify: { select: { explicit: true } },
      file: { select: { container: true } },
      feats: { select: { id: true, name: true } },
    }
  })
  if (!track) {
    log("error", "404", "trpc", `track.miniature looked for unknown track by id ${input.id}`)
    return null
  }

  lastFm.findTrack(input.id)
  spotify.findTrack(input.id)
  audioDb.fetchTrack(input.id)

  return track
})

const playcount = protectedProcedure.input(z.object({
  id: z.string(),
})).mutation(async ({ input, ctx }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  const now = new Date().toISOString()
  const track = await retryable(() => ctx.prisma.track.findUnique({
    where: { id: input.id },
    select: { albumId: true, artistId: true, name: true },
  }))
  if (!track) {
    log("error", "404", "trpc", `could not find track ${input.id} for playcount increase`)
    return
  }

  await ctx.prisma.$transaction([
    ctx.prisma.track.update({
      where: { id: input.id },
      data: {
        userData: {
          upsert: {
            update: { playcount: { increment: 1 }, lastListen: now },
            create: { playcount: 1, lastListen: now }
          }
        }
      }
    }),
    ...(track.albumId ? [
      ctx.prisma.album.update({
        where: { id: track.albumId },
        data: {
          userData: {
            upsert: {
              update: { playcount: { increment: 1 }, lastListen: now },
              create: { playcount: 1, lastListen: now }
            }
          }
        }
      })
    ] : []),
    ...(track.artistId ? [
      ctx.prisma.artist.update({
        where: { id: track.artistId },
        data: {
          userData: {
            upsert: {
              update: { playcount: { increment: 1 }, lastListen: now },
              create: { playcount: 1, lastListen: now }
            }
          }
        }
      })
    ] : []),
  ])

  log("info", "200", "trpc", `playcount +1 track "${track.name}"`)
  socketServer.emit("invalidate", { type: "track", id: input.id })
  if (track.albumId)
    socketServer.emit("invalidate", { type: "album", id: track.albumId })
  if (track.artistId)
    socketServer.emit("invalidate", { type: "artist", id: track.artistId })
  if (track.albumId || track.artistId)
    socketServer.emit("metrics", { type: "listen-count" })
})

const like = protectedProcedure.input(z.object({
  id: z.string(),
  toggle: z.boolean(),
})).mutation(async ({ input, ctx }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  const track = await retryable(() => ctx.prisma.track.findUnique({
    where: { id: input.id },
    select: { albumId: true, artistId: true, name: true },
  }))
  if (!track) {
    log("error", "404", "trpc", `could not find track ${input.id} for like ${input.toggle}`)
    return
  }

  const kind = input.toggle ? "increment" : "decrement"
  const init = input.toggle ? 1 : 0
  const { albumId, artistId } = track
  await ctx.prisma.$transaction([
    ctx.prisma.track.update({
      where: { id: input.id },
      data: {
        userData: {
          upsert: {
            update: { favorite: input.toggle },
            create: { favorite: input.toggle }
          }
        }
      }
    }),
    ...(albumId ? [
      ctx.prisma.album.update({
        where: { id: albumId },
        data: {
          userData: {
            upsert: {
              update: { favorite: { [kind]: 1 } },
              create: { favorite: init }
            }
          }
        }
      })
    ] : []),
    ...(artistId ? [
      ctx.prisma.artist.update({
        where: { id: artistId },
        data: {
          userData: {
            upsert: {
              update: { favorite: { [kind]: 1 } },
              create: { favorite: init }
            }
          }
        }
      })
    ] : []),
  ])

  log("info", "200", "trpc", `like ${input.toggle} track "${track.name}"`)
  socketServer.emit("invalidate", { type: "track", id: input.id })
  if (albumId)
    socketServer.emit("invalidate", { type: "album", id: albumId })
  if (artistId)
    socketServer.emit("invalidate", { type: "artist", id: artistId })
  socketServer.emit("metrics", { type: "likes" })

  return track
})

export function getSpotifyTracksByMultiTraitsWithTarget (
  traits: {
    trait: z.infer<typeof zTrackTraits>,
    value: number | string
  }[],
  count: number,
  offset = 0,
) {
  return prisma.$queryRawUnsafe(`
    SELECT
      "public"."SpotifyTrack"."trackId",
      ${traits.map((t) => `"public"."SpotifyTrack"."${t.trait}" as ${t.trait}`).join(",")},
      (0 - ${traits.map((t) => `ABS(${t.value}-${t.trait})`).join("-")}) as score
    FROM "public"."SpotifyTrack"
    WHERE (
      "public"."SpotifyTrack"."durationMs" > 30000
      AND ${traits.map((t) => `${t.trait} IS NOT NULL AND ${t.trait} <> 0`).join(" AND ")}
      AND ${traits.map((t) => `ABS(${t.value}-${t.trait}) < 0.5`).join(" AND ")}
    )
    ORDER BY score DESC LIMIT ${count} OFFSET ${offset}
  `) as unknown as { trackId: string }[]
}

const byMultiTraits = publicProcedure.input(z.object({
  traits: z.array(z.object({
    trait: zTrackTraits,
    value: z.string(),
  })),
})).query(async ({ input, ctx }) => {
  const spotifyTracks = await getSpotifyTracksByMultiTraitsWithTarget(input.traits, 6)
  const ids = spotifyTracks.map((t) => t.trackId)
  console.log("track.findMany from /trpc/track > multitrait")
  const tracks = await ctx.prisma.track.findMany({
    where: { id: { in: ids } },
  })
  tracks.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return tracks
})

export const trackRouter = router({
  searchable,
  miniature,
  playcount,
  like,
  byMultiTraits,
})
