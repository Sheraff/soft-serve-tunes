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
          tracks: true,
          subgenres: true,
          supgenres: true,
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

