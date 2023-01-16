import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import { zTrackTraits } from "./track"
import { prisma } from "server/db/client"

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
        }
      }
    }
  })

  if (album) {
    lastFm.findAlbum(input.id)
    audioDb.fetchAlbum(input.id)
  } else {
    log("error", "404", "trpc", `album.miniature looked for unknown album by id ${input.id}`)
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
        }
      },
      cover: {
        select: {
          id: true,
          palette: true,
        }
      },
      lastfm: {
        select: {
          name: true,
          releasedate: true,
        }
      },
      audiodb: {
        select: {
          strAlbum: true,
          intYearReleased: true,
          strDescriptionEN: true,
        }
      },
      spotify: {
        select: {
          name: true,
          totalTracks: true,
          releaseDate: true,
        }
      }
    }
  })

  if (!album) {
    log("error", "404", "trpc", `album.miniature looked for unknown album by id ${input.id}`)
    return album
  }

  lastFm.findAlbum(input.id)
  audioDb.fetchAlbum(input.id)

  return album
})

const mostFav = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.album.findMany({
    where: { userData: { favorite: { gt: 0 } } },
    orderBy: { userData: { favorite: "desc" } },
    take: 20,
    select: { id: true, name: true },
  })
})

const mostRecentListen = publicProcedure.query(({ ctx }) => {
  return ctx.prisma.album.findMany({
    where: { userData: { lastListen: { not: null } } },
    orderBy: { userData: { lastListen: "desc" } },
    take: 20,
    select: { id: true, name: true },
  })
})

const mostRecentAdd = publicProcedure.query(async ({ ctx }) => {
  const recent = await ctx.prisma.album.findMany({
    where: {OR: [
      { userData: null },
      { userData: {playcount: {equals: 0} } },
    ]},
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, name: true },
  })
  if (recent.length < 20) {
    recent.concat(await ctx.prisma.album.findMany({
      where: { userData: {playcount: {gt: 0} } },
      orderBy: { createdAt: "desc" },
      take: 20 - recent.length,
      select: { id: true, name: true },
    }))
  }
  return recent
})

function getAlbumsBySpotifyTracksByMultiTraitsWithTarget(
  traits: {
    trait: z.infer<typeof zTrackTraits>,
    value: number | string
  }[]
) {
  return prisma.$queryRawUnsafe(`
    SELECT
      "public"."SpotifyTrack"."albumId",
      AVG(0 - ${traits.map((t) => `ABS(${t.value}-"public"."SpotifyTrack"."${t.trait}")`).join("-")}) as score
    FROM "public"."SpotifyTrack"
    WHERE (
      "public"."SpotifyTrack"."durationMs" > 30000
      AND ${traits.map((t) => `${t.trait} IS NOT NULL AND ${t.trait} <> 0`).join(" AND ")}
      AND ${traits.map((t) => `ABS(${t.value}-${t.trait}) < 0.5`).join(" AND ")}
    )
    GROUP BY "public"."SpotifyTrack"."albumId" HAVING (
      (NOT "public"."SpotifyTrack"."albumId" IS NULL)
    )
    ORDER BY score DESC OFFSET 0
  `) as unknown as {albumId: string, score: number | null}[]
}

const byMultiTraits = publicProcedure.input(z.object({
  traits: z.array(z.object({
    trait: zTrackTraits,
    value: z.string(),
  })),
})).query(async ({ input, ctx }) => {
  const spotifyAlbums = await getAlbumsBySpotifyTracksByMultiTraitsWithTarget(input.traits)
  const ids = spotifyAlbums
    .filter(({score}) => score)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 20)
    .map(a => a.albumId)

  const albums = await ctx.prisma.album.findMany({
    where: {spotify: {id: { in: ids }}},
    select: { id: true, name: true, spotify: { select: { id: true } } },
  })
  albums.sort((a, b) => ids.indexOf(a.spotify!.id) - ids.indexOf(b.spotify!.id))
  return albums.map((a) => ({id: a.id, name: a.name}))
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

