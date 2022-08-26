import { createRouter } from "./context"
import { z } from "zod"

export const genreRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.genre.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              tracks: true,
              subgenres: true,
              supgenres: true,
            }
          }
        }
      })
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.genre.findMany({
        where: {
          tracks: {
            some: {}
          }
        },
        orderBy: {
          name: "asc",
        },
        include: {
          _count: {
            select: {
              tracks: true,
              subgenres: true,
              supgenres: true,
            }
          }
        }
      })
    }
  })
  .query("most-fav", {
    async resolve({ ctx }) {
      const genres = await ctx.prisma.genre.findMany({
        where: {tracks: {some: {userData: {favorite: true}}}},
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              tracks: true,
            }
          },
          tracks: {
            where: {
              userData: {
                favorite: true,
              }
            },
            select: {
              id: true,
            }
          }
        }
      })
      const mostLiked = genres
        .sort((a, b) => b.tracks.length - a.tracks.length)
        .slice(0, 10)
        .map(({id, name, _count}) => ({id, name, _count}))
      return mostLiked
    }
  })

