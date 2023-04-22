import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import { Prisma } from "@prisma/client"
import { computeArtistCover } from "server/db/computeCover"

const LISTS_SIZE = 30

const searchable = publicProcedure.query(async ({ ctx }) => {
  const raw = await ctx.prisma.artist.findMany({
    where: {
      OR: [
        { tracks: { some: {} } },
        { albums: { some: {} } },
        { feats: { some: {} } },
      ]
    },
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
  return raw.map(({ id, name, albums, tracks }) => {
    tracks.forEach(({ album }) => {
      if (album && !albums.some(({ id }) => id === album.id)) {
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
          feats: true,
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
  const trackSelect = {
    id: true,
    name: true,
    artist: {
      select: {
        id: true,
        name: true,
      }
    },
    genres: {
      select: {
        id: true,
        name: true,
      },
      where: { tracks: { some: {} } },
    },
  } satisfies Prisma.TrackSelect
  const artist = await ctx.prisma.artist.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      albums: {
        select: {
          id: true,
          name: true,
          tracks: {
            orderBy: {
              position: "asc"
            },
            select: trackSelect,
          },
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
          intBornYear: true,
          intFormedYear: true,
          strBiographyEN: true,
        }
      },
    }
  })

  if (!artist) {
    log("error", "404", "trpc", `artist.get looked for unknown artist by id ${input.id}`)
    return artist
  }

  // extra albums not directly by this artist
  const featured = await ctx.prisma.album.findMany({
    where: {
      OR: [
        { artistId: null },
        { artistId: { not: input.id } },
      ],
      id: { notIn: artist.albums.map(({ id }) => id) },
      tracks: {
        some: {
          OR: [
            { artistId: input.id },
            { feats: { some: { id: input.id } } },
          ]
        }
      },
    },
    select: {
      id: true,
      name: true,
      tracks: {
        orderBy: {
          position: "asc"
        },
        select: trackSelect,
        where: {
          OR: [
            { artistId: input.id },
            { feats: { some: { id: input.id } } },
          ]
        }
      },
    }
  })

  // extra tracks, not in albums
  const tracks = await ctx.prisma.track.findMany({
    where: {
      OR: [
        { artistId: input.id },
        { feats: { some: { id: input.id } } },
      ],
      albumId: null
    },
    select: trackSelect,
  })

  // playlists featuring this artist
  const playlists = await ctx.prisma.playlist.findMany({
    where: {
      tracks: {
        some: {
          track: {
            OR: [
              { artistId: input.id },
              { feats: { some: { id: input.id } } },
            ],
          }
        }
      }
    },
    select: { id: true, name: true }
  })

  const genres: { id: string, name: string }[] = []
  const genreIdSet = new Set<string>()
  for (const album of artist.albums) {
    for (const track of album.tracks) {
      for (const genre of track.genres) {
        if (!genreIdSet.has(genre.id)) {
          genres.push(genre)
          genreIdSet.add(genre.id)
        }
      }
    }
  }
  for (const album of featured) {
    for (const track of album.tracks) {
      for (const genre of track.genres) {
        if (!genreIdSet.has(genre.id)) {
          genres.push(genre)
          genreIdSet.add(genre.id)
        }
      }
    }
  }
  for (const track of tracks) {
    for (const genre of track.genres) {
      if (!genreIdSet.has(genre.id)) {
        genres.push(genre)
        genreIdSet.add(genre.id)
      }
    }
  }

  const tracksCount =
    artist.albums.reduce((acc, { tracks }) => acc + tracks.length, 0)
    + tracks.length
    + featured.reduce((acc, { tracks }) => acc + tracks.length, 0)

  lastFm.findArtist(input.id)
  audioDb.fetchArtist(input.id)
  // TODO: maybe this is temporary, maybe not (at some point many artists did not have a cover but I think it's because audiodb didn't use to call "compute covers")
  if (!artist.cover) {
    computeArtistCover(input.id, { tracks: false, album: false })
  }

  return {
    id: artist.id,
    name: artist.name,
    albums: artist.albums,
    _count: {
      albums: artist.albums.length,
      tracks: tracksCount,
    },
    audiodb: artist.audiodb,
    cover: artist.cover,
    genres,
    featured,
    tracks,
    playlists,
  }
})

const mostFav = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: { userData: { favorite: { gt: 0 } } },
    orderBy: [
      { userData: { favorite: "desc" } },
      { userData: { playcount: "desc" } },
    ],
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
})

const leastRecentListen = publicProcedure.query(async ({ ctx }) => {
  const neverListened = await ctx.prisma.artist.findMany({
    where: {
      AND: [
        {
          OR: [
            { userData: { lastListen: null } },
            { userData: { is: null } },
          ]
        },
        {
          OR: [
            { tracks: { some: {} } },
            { albums: { some: {} } },
          ]
        }
      ]
    },
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
  if (neverListened.length === LISTS_SIZE) {
    return neverListened
  }
  const oldestListened = await ctx.prisma.artist.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "asc" } },
    take: LISTS_SIZE - neverListened.length,
    select: { id: true, name: true },
  })
  return neverListened.concat(oldestListened)
})

const mostRecentListen = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "desc" } },
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
})

const mostRecentAdd = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.artist.findMany({
    where: {
      OR: [
        { tracks: { some: {} } },
        { albums: { some: {} } },
      ]
    },
    orderBy: { createdAt: "desc" },
    take: LISTS_SIZE,
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