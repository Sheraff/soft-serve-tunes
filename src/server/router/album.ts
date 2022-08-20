import { createRouter } from "./context";
import { z } from "zod";

export const albumRouter = createRouter()
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const album = await ctx.prisma.album.findUnique({
        where: { id: input.id },
        include: {
          _count: {
            select: {
              tracks: true,
            }
          },
          artist: true,
          tracks: {
            include: {
              metaImage: {
                select: {
                  id: true,
                  palette: true,
                }
              }
            }
          },
          lastfm: {
            select: {
              name: true,
              releasedate: true,
              cover: {
                select: {
                  id: true,
                  palette: true,
                }
              },
            }
          },
          audiodb: {
            select: {
              strAlbum: true,
              intYearReleased: true,
              strDescriptionEN: true,
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              thumbHq: {
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
              totalTracks: true,
              releaseDate: true,
              image: {
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
      if (album?.spotify?.image) {
        cover = album.spotify.image
      } else if (album?.audiodb?.thumbHq) {
        cover = album.audiodb.thumbHq
      } else if (album?.audiodb?.thumb) {
        cover = album.audiodb.thumb
      } else if (album?.lastfm?.cover) {
        cover = album.lastfm.cover
      } else if (album?.tracks?.[0]?.metaImage) {
        cover = album.tracks[0].metaImage
      }
      return {
        ...album,
        cover,
      }
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
              cover: {
                select: {
                  id: true,
                  palette: true,
                }
              }
            }
          },
          audiodb: {
            select: {
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              thumbHq: {
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
      if (album?.spotify?.image) {
        cover = album.spotify.image
      } else if (album?.audiodb?.thumbHq) {
        cover = album.audiodb.thumbHq
      } else if (album?.audiodb?.thumb) {
        cover = album.audiodb.thumb
      } else if (album?.lastfm?.cover) {
        cover = album.lastfm.cover
      } else if (album?.tracks?.[0]?.metaImage) {
        cover = album.tracks[0].metaImage
      }
      return {
        ...album,
        cover,
      }
    }
  })

