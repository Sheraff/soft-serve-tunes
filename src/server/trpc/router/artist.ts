import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"

const searchable = publicProcedure.query(async ({ctx}) => {
  const raw = await ctx.prisma.artist.findMany({
    where: { OR: [
      { tracks: {some: {}} },
      { albums: {some: {}} },
    ]},
    select: {
      id: true,
      name: true,
      albums: {
        select: {
          id: true,
          name: true,
        }
      },
      tracks: {
        select: {
          album: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      }
    }
  })
  return raw.map(({id, name, albums, tracks}) => {
    tracks.forEach(({album}) => {
      if (album && !albums.some(({id}) => id === album.id)) {
        albums.push(album)
      }
    })
    return {
      id,
      name,
      albums,
    }
  })
})

const miniature = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const artist = await ctx.prisma.artist.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          albums: true,
          tracks: true,
        },
      },
      cover: {
        select: {
          id: true,
          palette: true,
        }
      },
    }
  })

  if (artist) {
    lastFm.findArtist(input.id)
    audioDb.fetchArtist(input.id)
  } else {
    log("error", "404", "trpc", `artist.miniature looked for unknown artist by id ${input.id}`)
  }

  return artist
})

const get = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const artist = await ctx.prisma.artist.findUnique({
    where: { id: input.id },
    select: {
      name: true,
      _count: {
        select: {
          albums: true,
          tracks: true,
        },
      },
      albums: {
        select: {
          id: true,
          name: true,
        },
      },
      cover: {
        select: {
          id: true,
          palette: true,
        }
      },
      audiodb: {
        select: {
          intBornYear: true,
          intFormedYear: true,
          strBiographyEN: true,
        }
      },
      spotify: {
        select: {
          name: true,
        }
      },
    }
  })

  if (artist) {
    lastFm.findArtist(input.id)
    audioDb.fetchArtist(input.id)
  } else {
    log("error", "404", "trpc", `artist.get looked for unknown artist by id ${input.id}`)
    return null
  }

  // extra albums not directly by this artist
  const albums = await ctx.prisma.album.findMany({
    where: {
      AND: {
        OR: [
          {artistId: null},
          {artistId: {not: input.id}},
        ]
      },
      id: {notIn: artist.albums.map(({id}) => id)},
      tracks: {some: {artistId: input.id}},
    },
    select: {id: true, name: true}
  })

  // extra tracks, not in albums
  const tracks = await ctx.prisma.track.findMany({
    where: {
      artistId: input.id,
      albumId: null,
    },
    select: {id: true, name: true}
  })

  // playlists featuring this artist
  const playlists = await ctx.prisma.playlist.findMany({
    where: {
      tracks: {some: {track: {artistId: input.id}}}
    },
    select: {id: true, name: true}
  })

  return {
    ...artist,
    albums: [...artist.albums, ...albums],
    tracks,
    playlists,
  }
})

const mostFav = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: { userData: { favorite: { gt: 0 } } },
    orderBy: { userData: { favorite: "desc" } },
    take: 20,
    select: { id: true, name: true },
  })
})

const leastRecentListen = publicProcedure.query(async ({ ctx }) => {
  const neverListened = await ctx.prisma.artist.findMany({
    where: { AND: [
      { OR: [
        { userData: {lastListen: null} },
        { userData: {is: null} },
      ]},
      { OR: [
        { tracks: {some: {}} },
        { albums: {some: {}} },
      ]}
    ]},
    take: 20,
    select: { id: true, name: true },
  })
  if (neverListened.length === 20) {
    return neverListened
  }
  const oldestListened = await ctx.prisma.artist.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "asc" } },
    take: 20 - neverListened.length,
    select: { id: true, name: true },
  })
  return neverListened.concat(oldestListened)
})

const mostRecentListen = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "desc" } },
    take: 20,
    select: { id: true, name: true },
  })
})

const mostRecentAdd = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: { OR: [
      { tracks: {some: {}} },
      { albums: {some: {}} },
    ]},
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, name: true },
  })
})

export const artistRouter = router({
  searchable,
  miniature,
  get,
  mostFav,
  leastRecentListen,
  mostRecentListen,
  mostRecentAdd,
})