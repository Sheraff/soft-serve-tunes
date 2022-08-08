import { createRouter } from "./context";
import { z } from "zod";

export const trackRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.track.findUnique({
        where: { id: input.id },
        include: {
          picture: true,
          artist: true,
          album: true,
        }
      })
    },
  })
  .mutation("playcount", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.track.update({
        where: { id: input.id },
        data: {
          playcount: {
            increment: 1,
          },
        },
      })
    }
  })
