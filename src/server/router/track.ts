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
          metaImage: {
            select: {
              id: true,
            }
          },
          artist: true,
          album: true,
          genres: true,
        }
      })
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.track.findMany({
        include: {
          artist: {
            select: {
              id: true,
              name: true,
            },
          },
          album: {
            select: {
              id: true,
              name: true,
            },
          },
          genres: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      })
    }
  })
  .query("startsWith", {
    input: z
      .object({
        start: z.string().length(1),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.track.findMany({
        where: {
          name: {
            startsWith: input.start,
          },
        },
        include: {
          metaImage: {
            select: {
              id: true,
            }
          },
          artist: true,
          album: true,
          genres: true,
        }
      })
    }
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
