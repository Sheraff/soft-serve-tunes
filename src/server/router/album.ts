import { createRouter } from "./context"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import { type Prisma, type PrismaClient } from "@prisma/client"

async function albumMiniature(
  prisma: PrismaClient<Prisma.PrismaClientOptions, never, Prisma.RejectOnNotFound | Prisma.RejectPerOperation | undefined>,
  id: string,
) {
  const album = await prisma.album.findUnique({
    where: { id },
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
    lastFm.findAlbum(id)
    audioDb.fetchAlbum(id)
  } else {
    log("error", "404", "trpc", `album.miniature looked for unknown album by id ${id}`)
  }

  return album
}

export const albumRouter = createRouter()
  .query("searchable", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        where: {
          tracks: {
            some: {}
          }
        },
        select: {
          id: true,
          name: true,
          artist: {
            select: {
              name: true,
            }
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
      return albumMiniature(ctx.prisma, input.id)
    }
  })
  .query("miniature-set", {
    input: z
      .object({
        ids: z.array(z.string()),
      }),
    async resolve({ input, ctx }) {
      return Promise.all(input.ids.map(id => albumMiniature(ctx.prisma, id)))
    }
  })
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
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

      if (album) {
        lastFm.findAlbum(input.id)
        audioDb.fetchAlbum(input.id)
      } else {
        log("error", "404", "trpc", `album.miniature looked for unknown album by id ${input.id}`)
      }

      return album
    },
  })
  .query("most-fav", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        where: { userData: { favorite: { gt: 0 } } },
        orderBy: { userData: { favorite: "desc" } },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })
  .query("most-recent-listen", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        where: { userData: { isNot: null } },
        orderBy: { userData: { lastListen: "desc" } },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })
  .query("most-recent-add", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })
  .query("by-trait", {
    input: z.object({
      trait: z.union([
        z.literal("danceability"), // tempo, rhythm stability, beat strength, and overall regularity
        z.literal("energy"), // fast, loud, and noisy
        z.literal("speechiness"), // talk show, audio book, poetry
        z.literal("acousticness"),
        z.literal("instrumentalness"), // instrumental tracks / rap, spoken word
        z.literal("liveness"), // performed live / studio recording
        z.literal("valence"), // happy, cheerful, euphoric / sad, depressed, angry
      ]),
      order: z.union([
        z.literal("desc"),
        z.literal("asc"),
      ]),
    }),
    async resolve({ input, ctx }) {
      const {trait, order} = input
      const spotifyTracks = await ctx.prisma.spotifyTrack.groupBy({
        by: ["albumId"],
        _avg: {
          [trait]: true,
        },
        having: {
          NOT: {
            albumId: null
          },
          [trait]: {
            _avg: {
              [order === "desc" ? "gt" : "lt"]: 0.5,
            }
          },
        },
      })
      const orderMultiplier = order === "desc" ? 1 : -1
      const spotifyAlbumId = spotifyTracks
        .filter(a => (a._avg[trait] !== null) && a.albumId)
        .sort((a, b) => {
          const delta = (a._avg[trait] as unknown as number) - (b._avg[trait] as unknown as number)
          return orderMultiplier * delta
        })
        .slice(0, 10)
        .map(a => a.albumId) as string[]
      return ctx.prisma.album.findMany({
        where: {spotify: {id: { in: spotifyAlbumId }}},
        select: { id: true, name: true },
      })
    }
  })

