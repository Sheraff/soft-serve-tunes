import { createRouter } from "./context"
import { z } from "zod"

export const artistRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.artist.findUnique({
        where: { id: input.id },
        include: {
          albums: true,
          tracks: true,
          feats: true,
        }
      })
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.artist.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          _count: {
            select: {
              albums: true,
              tracks: true,
              feats: true,
            }
          }
        }
      })
    }
  })

