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
        where: {
          tracks: {
            some: {}
          }
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
  .query("miniature", {
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
          _count: {
            select: {
              tracks: true,
            },
          },
          lastfm: {
            select: {
              coverId: true,
            }
          },
          audiodb: {
            select: {
              thumbId: true,
              thumbHqId: true,
            }
          },
          spotify: {
            select: {
              name: true,
              imageId: true,
            }
          },
          artist: {
            select: {
              name: true,
            }
          },
          tracks: {
            where: {
              metaImageId: {
                not: null,
              }
            },
            take: 1,
            select: {
              metaImageId: true,
            }
          }
        }
      })
      let coverSrc = ""
      if (album?.spotify?.imageId) {
        coverSrc = album.spotify.imageId
      } else if (album?.audiodb?.thumbHqId) {
        coverSrc = album.audiodb.thumbHqId
      } else if (album?.audiodb?.thumbId) {
        coverSrc = album.audiodb.thumbId
      } else if (album?.lastfm?.coverId) {
        coverSrc = album.lastfm.coverId
      } else if (album?.tracks?.[0]?.metaImageId) {
        coverSrc = album.tracks[0].metaImageId
      }
      return {
        ...album,
        coverSrc,
      }
    }
  })

