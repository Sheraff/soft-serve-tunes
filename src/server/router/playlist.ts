import { createRouter } from "./context"
import { z } from "zod"
import { zTrackTraits } from "./track"
import { TRPCError } from "@trpc/server"
import { socketServer } from "server/persistent/ws"
import extractPlaylistCredits from "client/db/utils/extractPlaylistCredits"
import descriptionFromPlaylistCredits from "client/db/utils/descriptionFromPlaylistCredits"
import { prisma } from "server/db/client"

const trackSelect = {
  id: true,
  name: true,
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
} // satisfies Prisma.TrackFindManyArgs['select']

async function getResolve(id: string) {
  const result = await prisma.playlist.findUnique({
    where: { id },
    include: {
      tracks: {
        include: {track: {select: {
          id: true,
          name: true,
          artist: { select: {
            id: true,
            name: true
          }},
          album: { select: {
            id: true,
            name: true,
            coverId: true
          }},
        }}},
        orderBy: { index: 'asc' },
      },
      _count: {
        select: { tracks: true },
      }
    }
  })
  if (!result) {
    return result
  }
  const tracks = result.tracks.map(({track}) => track)
  const {artists, albums} = extractPlaylistCredits(tracks)
  const description = descriptionFromPlaylistCredits(artists, tracks.length)
  return {
    ...result,
    tracks,
    artists,
    albums,
    description,
  }
}

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
          select: trackSelect,
        })
      }
      if (input.type === 'artist') {
        return ctx.prisma.track.findMany({
          where: { artistId: input.id },
          orderBy: [
            { albumId: 'asc' },
            { position: 'asc' },
          ],
          select: trackSelect,
        })
      }
      if (input.type === 'album') {
        return ctx.prisma.track.findMany({
          where: { albumId: input.id },
          orderBy: { position: 'asc' },
          select: trackSelect,
        })
      }
      if (input.type === 'genre') {
        return ctx.prisma.track.findMany({
          where: { genres: { some: { id: input.id } } },
          select: trackSelect,
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
          select: trackSelect,
        })
      }
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.playlist.findMany({
        select: {name: true, id: true}
      })
    }
  })
  .query("get", {
    input: z.object({
      id: z.string()
    }),
    resolve({ input }) {
      return getResolve(input.id)
    }
  })
  .query("searchable", {
    async resolve({ ctx }) {
      const playlists = await ctx.prisma.playlist.findMany({
        select: {
          id: true,
          name: true,
          tracks: {
            select: {
              track: {
                select: {
                  artist: {
                    select: {
                      name: true,
                    },
                  },
                }
              }
            }
          }
        }
      })
      const result = playlists.map(playlist => {
        const artists = new Set<string | undefined>()
        playlist.tracks.forEach(track => {
          artists.add(track.track.artist?.name)
        })
        artists.delete(undefined)
        return {
          id: playlist.id,
          name: playlist.name,
          artists: Array.from(artists) as string[],
        }
      })
      return result
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
          }))},
        },
        select: {id: true},
      })
      socketServer.send("watcher:add-playlist")
      return getResolve(playlist.id)
    }
  })
  .mutation("modify", {
    input: z.union([
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
          id: z.string(),
          index: z.number(),
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
    ]),
    async resolve({ input, ctx }) {
      if (input.type === "reorder") {
        const min = Math.min(input.params.from, input.params.to)
        const max = Math.max(input.params.from, input.params.to)
        const direction = input.params.from < input.params.to ? -1 : 1
        await ctx.prisma.$transaction(async (tx) => {
          const entries = await tx.playlistEntry.findMany({
            where: {
              playlistId: input.id,
              index: {
                gte: min,
                lte: max,
              },
            },
            select: {id: true, index: true},
          })
          for (const entry of entries) {
            await tx.playlistEntry.update({
              where: {id: entry.id},
              data: {
                index: entry.index === input.params.from
                  ? input.params.to
                  : entry.index + direction
              }
            })
          }
          await tx.playlist.update({
            where: { id: input.id },
            data: { modifiedAt: new Date().toISOString() },
          })
        })
      } else if (input.type === "remove-track") {
        await ctx.prisma.$transaction(async (tx) => {
          const [entry] = await tx.playlistEntry.findMany({
            where: {
              playlistId: input.id,
              trackId: input.params.id
            },
            select: {index: true, id: true}
          })
          if (!entry) {
            throw new TRPCError({
              message: `Couldn't locate playlist entry to delete: track ${input.params.id} in playlist ${input.id}`,
              code: "NOT_FOUND"
            })
          }
          await tx.playlistEntry.delete({
            where: {id: entry.id}
          })
          const entries = await tx.playlistEntry.findMany({
            where: {
              playlistId: input.id,
              index: {gte: entry.index},
            },
            select: {id: true, index: true},
          })
          for (const entry of entries) {
            await tx.playlistEntry.update({
              where: { id: entry.id },
              data: { index: entry.index - 1 },
            })
          }
          await tx.playlist.update({
            where: { id: input.id },
            data: { modifiedAt: new Date().toISOString() },
          })
        })
      } else if (input.type === "add-track") {
        await ctx.prisma.$transaction(async (tx) => {
          const entries = await tx.playlistEntry.findMany({
            where: {
              playlistId: input.id,
              index: {gte: input.params.index},
            },
            select: {id: true, index: true},
          })
          for (const entry of entries) {
            await tx.playlistEntry.update({
              where: { id: entry.id },
              data: { index: entry.index + 1 },
            })
          }
          await tx.playlistEntry.create({
            data: {
              index: input.params.index,
              playlistId: input.id,
              trackId: input.params.id,
            }
          })
          await tx.playlist.update({
            where: { id: input.id },
            data: { modifiedAt: new Date().toISOString() },
          })
        })
      } else if (input.type === "rename") {
        await ctx.prisma.playlist.update({
          where: { id: input.id },
          data: {
            name: input.params.name,
            modifiedAt: new Date().toISOString(),
          },
        })
      }
      socketServer.send('invalidate:playlist', { id: input.id })
      // return getResolve(input.id)
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
      try {
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
      } catch (e) {
        console.warn(e)
        // at this point the playlist is corrupted, probably because the transaction happened during a bad time for the DB
        let tracks: {id: string}[] | null = null
        try {
          const entries = await ctx.prisma.playlist.findUnique({
            where: { id: input.id },
            select: { tracks: { select: { id: true } } }
          })
          if (entries) {
            tracks = entries.tracks
          }
        } catch {}
        if (!tracks) {
          try {
            const entries = await ctx.prisma.playlistEntry.findMany({
              where: { playlistId: input.id },
              select: { id: true }
            })
            tracks = entries
          } catch {}
        }
        if (!tracks) {
          const reason = "Couldn't recover, the playlist itself doesn't seem to exist anymore and we can't find the playlistEntries anymore"
          console.log()
          socketServer.send('watcher:remove-playlist', { playlist: { id: input.id } })
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
            console.warn("this is probably normal, we're trying to recover from the previous warning")
            console.warn(e)
          }
        }
        try {
          await ctx.prisma.playlist.delete({
            where: { id: input.id },
          })
        } catch {}
        const playlist = { id: input.id }
        socketServer.send('watcher:remove-playlist', { playlist })
        return playlist
      }
    }
  })
