import { createRouter } from "./context";
import { z } from "zod";

export const albumRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.album.findUnique({
        where: { id: input.id },
        include: {
          artist: true,
          tracks: true,
        }
      })
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          artist: {
            select: {
              id: true,
              name: true,
            }
          },
        }
      })
    }
  })

