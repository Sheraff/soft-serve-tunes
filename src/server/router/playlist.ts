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
        const entries = await ctx.prisma.playlist.findUnique({
          where: { id: input.id },
          select: { tracks: { select: { id: true } } }
        })
        if (!entries) {
          console.log("Couldn't recover, the playlist itself doesn't seem to exist anymore")
          socketServer.send('watcher:remove-playlist', { playlist: {id: input.id } })
          throw e
        }
        for (const entry of entries.tracks) {
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
        const playlist = await ctx.prisma.playlist.delete({
          where: { id: input.id },
          select: { id: true },
        })
        socketServer.send('watcher:remove-playlist', { playlist })
        return playlist
      }
    }
  })
