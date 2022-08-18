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
          _count: {
            select: {
              albums: true,
              tracks: true,
            },
          },
          albums: true,
          audiodb: {
            select: {
              strArtist: true,
              thumbId: true,
              cutoutId: true,
              intBornYear: true,
              intFormedYear: true,
              strBiographyEN: true,
            }
          },
          spotify: {
            select: {
              name: true,
              imageId: true,
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
    },
  })
  .query("miniature", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const artist = await ctx.prisma.artist.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              albums: true,
              tracks: true,
            },
          },
          audiodb: {
            select: {
              strArtist: true,
              thumbId: true,
              cutoutId: true,
            }
          },
          spotify: {
            select: {
              name: true,
              imageId: true,
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
      if (artist?.audiodb?.cutoutId) {
        coverSrc = artist.audiodb.cutoutId
      } else if (artist?.audiodb?.thumbId) {
        coverSrc = artist.audiodb.thumbId
      } else if (artist?.spotify?.imageId) {
        coverSrc = artist.spotify.imageId
      } else if (artist?.tracks?.[0]?.metaImageId) {
        coverSrc = artist.tracks[0].metaImageId
      }
      return {
        ...artist,
        coverSrc,
      }
    }
  })
  .query("list", {
    async resolve({ ctx }) {
      return ctx.prisma.artist.findMany({
        orderBy: {
          name: "asc",
        },
        where: {
          OR: [{
            tracks: {
              some: {}
            },
          }, {
            albums: {
              some: {}
            }
          }],
        },
        include: {
          albums: {
            take: 1,
            orderBy: {
              year: "desc",
            },
          },
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

