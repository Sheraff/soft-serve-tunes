import { router, publicProcedure, protectedProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { spotify } from "server/persistent/spotify"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
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

export async function getSpotifyTracksByMultiTraitsWithTarget (
  traits: {
    trait: z.infer<typeof zTrackTraits>,
    value: number | string
  }[],
  count: number,
  offset = 0,
) {
  const tracks = await prisma.$queryRawUnsafe<{
    id: string
    name: string
    score: number
    artistId: string | null
    artistName: string | null
    albumId: string | null
    albumName: string | null
  }[]>(`
    WITH spotify_list AS (
      SELECT
        public."SpotifyTrack"."trackId",
        (0 - ${traits.map((t) => `ABS(${t.value} - public."SpotifyTrack"."${t.trait}")`).join(" - ")})::float as score
      FROM public."SpotifyTrack"
      WHERE (
        public."SpotifyTrack"."durationMs" > 30000
        AND ${traits.map((t) => `
          public."SpotifyTrack"."${t.trait}" IS NOT NULL
          AND public."SpotifyTrack"."${t.trait}" <> 0
        `).join(" AND ")}
        AND ${traits.map((t) => `
          ABS(${t.value} - public."SpotifyTrack"."${t.trait}") < 0.5
        `).join(" AND ")}
      )
    )
    SELECT
      tracks.id as id,
      tracks.name as name,
      artists.id as "artistId",
      artists.name as "artistName",
      albums.id as "albumId",
      albums.name as "albumName",
      spotify_list.score as score
    FROM public."Track" tracks
    INNER JOIN spotify_list ON spotify_list."trackId" = tracks.id
    LEFT JOIN public."Artist" artists ON artists.id = tracks."artistId"
    LEFT JOIN public."Album" albums ON albums.id = tracks."albumId"
    ORDER BY score DESC
    LIMIT ${count}
    OFFSET ${offset}
    ;
  `)

  return tracks.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artistId ? {
      id: track.artistId,
      name: track.artistName!,
    } : null,
    album: track.albumId ? {
      id: track.albumId,
      name: track.albumName!,
    } : null,
  }))
}

const byMultiTraits = protectedProcedure.input(z.object({
  traits: z.array(z.object({
    trait: zTrackTraits,
    value: z.string(),
  })),
})).query(async ({ input }) => {
  return getSpotifyTracksByMultiTraitsWithTarget(input.traits, 6)
})

export const trackRouter = router({
  searchable,
  miniature,
  playcount,
  like,
  byMultiTraits,
})
