import { router, publicProcedure, protectedProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { getSpotifyTracksByMultiTraitsWithTarget, zTrackTraits } from "./track"
import { TRPCError } from "@trpc/server"
import extractPlaylistCredits from "client/db/useMakePlaylist/extractPlaylistCredits"
import descriptionFromPlaylistCredits from "client/db/useMakePlaylist/descriptionFromPlaylistCredits"
import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import generateUniqueName from "utils/generateUniqueName"
import log from "utils/logger"
import { socketServer } from "utils/typedWs/server"

async function getResolve (id: string) {
  const result = await prisma.playlist.findUnique({
    where: { id },
    include: {
      tracks: {
        include: {
          track: {
            select: {
              id: true,
              name: true,
              artist: {
                select: {
                  id: true,
                  name: true
                }
              },
              album: {
                select: {
                  id: true,
                  name: true,
                  coverId: true
                }
              },
            }
          }
        },
        orderBy: { index: "asc" },
      },
      _count: {
        select: { tracks: true },
      }
    }
  })
  if (!result) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Playlist not found by id ${id}` })
  }
  const tracks = result.tracks.map(({ track }) => track)
  const { artists, albums } = extractPlaylistCredits(tracks)
  const description = descriptionFromPlaylistCredits(artists, tracks.length)
  return {
    ...result,
    tracks,
    artists,
    albums,
    description,
  }
}

const generate = protectedProcedure.input(z.object({
  type: z.literal("by-multi-traits"),
  traits: z.array(z.object({
    trait: zTrackTraits,
    value: z.string(),
  })),
})).query(async ({ input }) => {
  if (input.type === "by-multi-traits") {
    return getSpotifyTracksByMultiTraitsWithTarget(input.traits, 15)
  }
})

const more = protectedProcedure.input(
  z.object({
    type: z.literal("by-similar-tracks"),
    trackIds: z.array(z.string()),
  })
).mutation(async ({ input, ctx }) => {
  if (input.type === "by-similar-tracks") {
    const features = await ctx.prisma.spotifyTrack.aggregate({
      where: { trackId: { in: input.trackIds } },
      _avg: {
        danceability: true,
        energy: true,
        valence: true,
        acousticness: true,
        instrumentalness: true,
        liveness: true,
        speechiness: true,
      },
    })
    const entries = Object.entries(features._avg) as [keyof typeof features["_avg"], number | null][]
    const traits = entries.reduce((traits, [trait, value]) => {
      if (value !== null) {
        traits.push({ trait, value })
      }
      return traits
    }, [] as Parameters<typeof getSpotifyTracksByMultiTraitsWithTarget>[0])
    if (traits.length === 0) {
      log("error", "empty", "trpc", "No traits found")
      return []
    }
    return await getSpotifyTracksByMultiTraitsWithTarget(traits, 15, input.trackIds)
  }
})

const get = publicProcedure.input(z.object({
  id: z.string()
})).query(({ input }) => {
  return getResolve(input.id)
})

const searchable = publicProcedure.query(async ({ ctx }) => {
  const test = await ctx.prisma.$queryRaw`
    SELECT DISTINCT ON(p.id, a.id, p."modifiedAt")
      p.id,
      p.name,
      a.name as artistName,
      p."modifiedAt"
    FROM public."Playlist" as p
    LEFT JOIN public."PlaylistEntry" as pe
      ON pe."playlistId" = p.id
    LEFT JOIN public."Track" as t
      ON t.id = pe."trackId"
    LEFT JOIN public."Artist" as a
      ON a.id = t."artistId"
    ORDER BY p."modifiedAt" DESC
    ;
  ` as {
    id: string
    name: string
    artistName: string | null
    modifiedAt: string
  }[]

  const final: {
    id: string
    name: string
    artists: string[]
  }[] = []
  let lastPlaylist: string | undefined
  let current: typeof final[number] | undefined

  for (let i = 0; i < test.length; i++) {
    const entry = test[i]!
    if (entry.id === lastPlaylist) {
      if (entry.artistName)
        current!.artists.push(entry.artistName)
    } else {
      lastPlaylist = entry.id
      const artists = entry.artistName ? [entry.artistName] : []
      current = {
        id: lastPlaylist,
        name: entry.name,
        artists,
      }
      final.push(current)
    }
  }

  return final
})

const save = protectedProcedure.input(z.object({
  name: z.string(),
  tracks: z.array(z.object({
    id: z.string(),
    index: z.number(),
  }))
})).mutation(async ({ input, ctx }) => {
  const playlists = await ctx.prisma.playlist.findMany({
    select: { name: true }
  })
  const name = generateUniqueName(input.name, playlists)
  const playlist = await ctx.prisma.playlist.create({
    data: {
      name,
      tracks: {
        create: input.tracks.map(({ id, index }) => ({
          index,
          trackId: id,
        }))
      },
    },
    select: { id: true },
  })
  socketServer.emit("add", { type: "playlist", id: playlist.id })
  return getResolve(playlist.id)
})

const modify = protectedProcedure.input(z.union([
  z.object({
    id: z.string(),
    type: z.enum(["reorder"]),
    params: z.object({
      from: z.number(),
      to: z.number(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.enum(["add-track"]),
    params: z.object({
      id: z.union([z.string(), z.array(z.string())]),
      index: z.number().optional(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.enum(["remove-track"]),
    params: z.object({
      id: z.string(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.enum(["rename"]),
    params: z.object({
      name: z.string(),
    }),
  }),
])).mutation(async ({ input, ctx }) => {
  if (input.type === "reorder") {
    const min = Math.min(input.params.from, input.params.to)
    const max = Math.max(input.params.from, input.params.to)
    const direction = input.params.from < input.params.to ? "decrement" : "increment"
    await ctx.prisma.$transaction(async (tx) => {
      const entries = await tx.playlistEntry.findMany({
        where: {
          playlistId: input.id,
          index: {
            gte: min,
            lte: max,
          },
        },
        select: { id: true, index: true },
      })
      let target = ""
      const rest: string[] = []
      for (const entry of entries) {
        if (entry.index === input.params.from) {
          target = entry.id
        } else {
          rest.push(entry.id)
        }
      }
      if (!target) throw new TRPCError({
        message: `Target track not found at index ${input.params.from} in playlist ${input.id}`,
        code: "UNPROCESSABLE_CONTENT",
      })
      tx.playlistEntry.updateMany({
        where: { id: { in: rest } },
        data: {
          index: {
            [direction]: 1,
          }
        }
      })
      tx.playlistEntry.update({
        where: { id: target },
        data: {
          index: input.params.to,
        }
      })
      await tx.playlist.update({
        where: { id: input.id },
        data: { modifiedAt: new Date().toISOString() },
      })
    })
    log("info", "200", "trpc", `playlist order changed "${input.id}" ${input.params.from} > ${input.params.to}`)
  } else if (input.type === "remove-track") {
    await ctx.prisma.$transaction(async (tx) => {
      const [entry] = await tx.playlistEntry.findMany({
        where: {
          playlistId: input.id,
          trackId: input.params.id
        },
        select: { index: true, id: true }
      })
      if (!entry) {
        throw new TRPCError({
          message: `Couldn't locate playlist entry to delete: track ${input.params.id} in playlist ${input.id}`,
          code: "NOT_FOUND"
        })
      }
      await tx.playlistEntry.delete({
        where: { id: entry.id }
      })
      await tx.playlistEntry.updateMany({
        where: {
          playlistId: input.id,
          index: { gte: entry.index },
        },
        data: { index: { decrement: 1 } },
      })
      await tx.playlist.update({
        where: { id: input.id },
        data: { modifiedAt: new Date().toISOString() },
      })
    })
    log("info", "200", "trpc", `playlist track removed "${input.params.id}"`)
  } else if (input.type === "add-track") {
    const ids = Array.isArray(input.params.id) ? input.params.id : [input.params.id]
    if (typeof input.params.index === "number") {
      const index = input.params.index!
      await ctx.prisma.$transaction(async (tx) => {
        const entries = await tx.playlistEntry.findMany({
          where: { playlistId: input.id },
          select: { id: true, index: true, trackId: true },
        })
        const newIds = ids.filter(id => !entries.some(entry => entry.trackId === id))
        await tx.playlistEntry.updateMany({
          where: { playlistId: input.id, index: { gte: index } },
          data: { index: { increment: newIds.length } },
        })
        await tx.playlistEntry.createMany({
          data: newIds.map((id, i) => ({
            index: index + i,
            playlistId: input.id,
            trackId: id,
          }))
        })
        await tx.playlist.update({
          where: { id: input.id },
          data: { modifiedAt: new Date().toISOString() },
        })
      })
    } else {
      await ctx.prisma.$transaction(async (tx) => {
        const entries = await tx.playlistEntry.findMany({
          where: { playlistId: input.id },
          orderBy: { index: "desc" },
          select: { index: true, trackId: true },
        })
        const last = entries[0]
        if (!last) {
          throw new TRPCError({
            message: `playlist ${input.id} not found during add-track w/o params.index`,
            code: "NOT_FOUND",
          })
        }
        const newIds = ids.filter(id => !entries.some(entry => entry.trackId === id))
        await tx.playlistEntry.createMany({
          data: newIds.map((id, i) => ({
            index: last.index + 1 + i,
            playlistId: input.id,
            trackId: id,
          }))
        })
        await tx.playlist.update({
          where: { id: input.id },
          data: { modifiedAt: new Date().toISOString() },
        })
      })
    }
    log("info", "200", "trpc", `playlist track added "${input.params.id}"`)
  } else if (input.type === "rename") {
    const playlists = await ctx.prisma.playlist.findMany({
      where: { id: { not: input.id } },
      select: { name: true },
    })
    const name = generateUniqueName(input.params.name, playlists)
    await retryable(() => ctx.prisma.playlist.update({
      where: { id: input.id },
      data: {
        name,
        modifiedAt: new Date().toISOString(),
      },
    }))
    log("info", "200", "trpc", `playlist renamed "${name}"`)
  }
  socketServer.emit("invalidate", { type: "playlist", id: input.id })
})

const deleteEndpoint = protectedProcedure.input(z.object({
  id: z.string()
})).mutation(async ({ input, ctx }) => {
  try {
    const [, playlist] = await ctx.prisma.$transaction([
      ctx.prisma.playlistEntry.deleteMany({
        where: { playlistId: input.id },
      }),
      ctx.prisma.playlist.delete({
        where: { id: input.id },
        select: { id: true },
      }),
    ])
    socketServer.emit("remove", { type: "playlist", id: playlist.id })
    return playlist
  } catch (e) {
    console.warn("Playlist deletion on a corrupted playlist, trying to recover")
    console.warn(e)
    // at this point the playlist is corrupted, probably because the transaction happened during a bad time for the DB
    let tracks: { id: string }[] | null = null
    try {
      const entries = await ctx.prisma.playlist.findUnique({
        where: { id: input.id },
        select: { tracks: { select: { id: true } } }
      })
      if (entries) {
        tracks = entries.tracks
      }
    } catch { }
    if (!tracks) {
      try {
        const entries = await ctx.prisma.playlistEntry.findMany({
          where: { playlistId: input.id },
          select: { id: true }
        })
        tracks = entries
      } catch { }
    }
    if (!tracks) {
      const reason = "Couldn't recover, the playlist itself doesn't seem to exist anymore and we can't find the playlistEntries anymore"
      console.log(reason)
      socketServer.emit("remove", { type: "playlist", id: input.id })
      throw new TRPCError({
        message: reason,
        code: "INTERNAL_SERVER_ERROR",
      })
    }
    for (const entry of tracks) {
      const exists = await ctx.prisma.playlistEntry.findUnique({
        where: { id: entry.id }
      })
      if (!exists) continue
      try {
        await ctx.prisma.playlistEntry.delete({
          where: { id: entry.id }
        })
      } catch (e) {
        console.warn(new Error("this is probably normal, we're trying to recover from the previous warning", { cause: e }))
      }
    }
    try {
      await ctx.prisma.playlist.delete({
        where: { id: input.id },
      })
    } catch { }
    const playlist = { id: input.id }
    socketServer.emit("remove", { type: "playlist", id: playlist.id })
    return playlist
  }
})

export const playlistRouter = router({
  generate,
  more,
  get,
  searchable,
  save,
  modify,
  delete: deleteEndpoint,
})
