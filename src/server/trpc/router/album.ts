import { router, publicProcedure, protectedProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import { zTrackTraits } from "./track"
import { prisma } from "server/db/client"
import { TRPCError } from "@trpc/server"

const LISTS_SIZE = 30

const searchable = publicProcedure.query(async ({ ctx }) => {
  const data = await ctx.prisma.album.findMany({
    where: {
      tracks: {
        some: {}
      }
    },
    select: {
      id: true,
      name: true,
      artist: { select: { name: true } },
      tracks: { select: { artist: { select: { name: true } } } },
    }
  })
  return data.map(({ id, name, artist, tracks }) => {
    const artists = new Set<string>()
    if (artist?.name) artists.add(artist.name)
    tracks.forEach(({ artist }) => {
      if (artist?.name) artists.add(artist.name)
    })
    return {
      id,
      name,
      artist,
      artists: Array.from(artists),
    }
  })
})

const miniature = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const album = await ctx.prisma.album.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          tracks: true,
        },
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
          blur: true,
        }
      }
    }
  })

  if (album) {
    lastFm.findAlbum(input.id)
    audioDb.fetchAlbum(input.id)
  } else {
    throw new TRPCError({ code: "NOT_FOUND", message: `album.miniature looked for unknown album by id ${input.id}` })
  }

  return album
})

const get = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const album = await ctx.prisma.album.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: {
        select: {
          tracks: true,
        }
      },
      artist: {
        select: {
          id: true,
          name: true,
        }
      },
      tracks: {
        orderBy: {
          position: "asc"
        },
        select: {
          id: true,
          name: true,
          position: true,
          artist: {
            select: {
              id: true,
              name: true,
            }
          },
          feats: {
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
        },
      },
      cover: {
        select: {
          id: true,
          palette: true,
          blur: true,
        }
      },
      lastfm: {
        select: {
          releasedate: true,
        }
      },
      audiodb: {
        select: {
          intYearReleased: true,
          strDescriptionEN: true,
        }
      },
      spotify: {
        select: {
          releaseDate: true,
        }
      }
    }
  })

  if (!album) {
    throw new TRPCError({ code: "NOT_FOUND", message: `album.get looked for unknown album by id ${input.id}` })
  }

  const genres: { id: string, name: string }[] = []
  const genreIdSet = new Set<string>()
  for (const track of album.tracks) {
    for (const genre of track.genres) {
      if (!genreIdSet.has(genre.id)) {
        genres.push(genre)
        genreIdSet.add(genre.id)
      }
    }
  }

  const feats: { id: string, name: string }[] = []
  const featIdSet = new Set<string>()
  if (album.artist?.id) {
    featIdSet.add(album.artist.id)
  }
  for (const track of album.tracks) {
    if (track.artist && !featIdSet.has(track.artist.id)) {
      feats.push(track.artist)
      featIdSet.add(track.artist.id)
    }
    for (const feat of track.feats) {
      if (!featIdSet.has(feat.id)) {
        feats.push(feat)
        featIdSet.add(feat.id)
      }
    }
  }

  lastFm.findAlbum(input.id)
  audioDb.fetchAlbum(input.id)

  return {
    ...album,
    genres,
    feats,
  }
})

const mostFav = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.album.findMany({
    where: { userData: { favorite: { gt: 0 } } },
    orderBy: [
      { userData: { favorite: "desc" } },
      { userData: { playcount: "desc" } },
    ],
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
})

const mostRecentListen = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.album.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "desc" } },
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
})

const mostRecentAdd = publicProcedure.query(async ({ ctx }) => {
  const recent = await ctx.prisma.album.findMany({
    where: {
      OR: [
        { userData: null },
        { userData: { playcount: { equals: 0 } } },
      ]
    },
    orderBy: { createdAt: "desc" },
    take: LISTS_SIZE,
    select: { id: true, name: true },
  })
  if (recent.length < LISTS_SIZE) {
    recent.concat(await ctx.prisma.album.findMany({
      where: { userData: { playcount: { gt: 0 } } },
      orderBy: { createdAt: "desc" },
      take: LISTS_SIZE - recent.length,
      select: { id: true, name: true },
    }))
  }
  return recent
})

function getAlbumsBySpotifyTracksByMultiTraitsWithTarget (
  traits: {
    trait: z.infer<typeof zTrackTraits>,
    value: number | string
  }[]
) {
  return prisma.$queryRawUnsafe<{
    id: string
    name: string
    score: number | null
  }[]>(`
    WITH spotify_list AS (
      SELECT
        public."SpotifyTrack"."albumId",
        AVG(0 - ${traits.map((t) => `ABS(${t.value} - public."SpotifyTrack"."${t.trait}")`).join(" - ")})::float as score
      FROM public."SpotifyTrack"
      WHERE (
        public."SpotifyTrack"."durationMs" > 30000
        AND ${traits.map((t) => `
          public."SpotifyTrack".${t.trait} IS NOT NULL
          AND public."SpotifyTrack".${t.trait} <> 0
        `).join(" AND ")}
        AND ${traits.map((t) => `
          ABS(${t.value} - public."SpotifyTrack".${t.trait}) < 0.5
        `).join(" AND ")}
      )
      GROUP BY public."SpotifyTrack"."albumId"
      HAVING public."SpotifyTrack"."albumId" IS NOT NULL
    )
    SELECT
      albums.id as id,
      albums.name as name,
      spotify_list.score as score
    FROM public."Album" albums
    INNER JOIN public."SpotifyAlbum" spotify_albums
      ON spotify_albums."albumId" = albums.id
    INNER JOIN spotify_list
      ON spotify_list."albumId" = spotify_albums.id
    WHERE spotify_list.score IS NOT NULL
    ORDER BY score DESC
    LIMIT ${LISTS_SIZE}
    ;
  `)
}

const byMultiTraits = protectedProcedure.input(z.object({
  traits: z.array(z.object({
    trait: zTrackTraits,
    value: z.string(),
  })),
})).query(async ({ input }) => {
  return await getAlbumsBySpotifyTracksByMultiTraitsWithTarget(input.traits)
})


// const byTrait = publicProcedure.input(z.object({
//   trait: zTrackTraits,
//   order: z.enum(['desc', 'asc']),
// })).query(async ({ input, ctx }) => {
//   const {trait, order} = input
//   const spotifyTracks = await ctx.prisma.spotifyTrack.groupBy({
//     by: ["albumId"],
//     _avg: {
//       [trait]: true,
//     },
//     having: {
//       NOT: {
//         albumId: null
//       },
//       [trait]: {
//         _avg: {
//           [order === "desc" ? "gt" : "lt"]: 0.5,
//         }
//       },
//     },
//   })
//   const orderMultiplier = order === "desc" ? 1 : -1
//   const spotifyAlbumId = spotifyTracks
//     .filter(a => (a._avg[trait] !== null) && a.albumId)
//     .sort((a, b) => {
//       const delta = (a._avg[trait] as unknown as number) - (b._avg[trait] as unknown as number)
//       return orderMultiplier * delta
//     })
//     .slice(0, 20)
//     .map(a => a.albumId) as string[]
//   return ctx.prisma.album.findMany({
//     where: {spotify: {id: { in: spotifyAlbumId }}},
//     select: { id: true, name: true },
//   })
// })

export const albumRouter = router({
  searchable,
  miniature,
  get,
  mostFav,
  mostRecentListen,
  mostRecentAdd,
  byMultiTraits,
})

