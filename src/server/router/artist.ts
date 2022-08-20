import { createRouter } from "./context"
import { z } from "zod"

export const artistRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const artist = await ctx.prisma.artist.findUnique({
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
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              intBornYear: true,
              intFormedYear: true,
              strBiographyEN: true,
            }
          },
          spotify: {
            select: {
              name: true,
              image: {
                select: {
                  id: true,
                  palette: true,
                }
              },
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
              metaImage: {
                select: {
                  id: true,
                  palette: true,
                }
              },
            }
          }
        }
      })
      let cover = undefined
      if (artist?.audiodb?.thumb) {
        cover = artist.audiodb.thumb
      } else if (artist?.spotify?.image) {
        cover = artist.spotify.image
      } else if (artist?.tracks?.[0]?.metaImage) {
        cover = artist.tracks[0].metaImage
      }
      return {
        ...artist,
        cover,
      }
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
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              cutout: {
                select: {
                  id: true,
                  palette: true,
                }
              },
            }
          },
          spotify: {
            select: {
              name: true,
              image: {
                select: {
                  id: true,
                  palette: true,
                }
              },
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
              metaImage: {
                select: {
                  id: true,
                  palette: true,
                }
              },
            }
          }
        }
      })
      let cover = undefined
      if (artist?.audiodb?.cutout) {
        cover = artist.audiodb.cutout
      } else if (artist?.audiodb?.thumb) {
        cover = artist.audiodb.thumb
      } else if (artist?.spotify?.image) {
        cover = artist.spotify.image
      } else if (artist?.tracks?.[0]?.metaImage) {
        cover = artist.tracks[0].metaImage
      }
      return {
        ...artist,
        cover,
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

