import { createRouter } from "./context"
import { z } from "zod"
import { lastFm } from "../persistent/lastfm"
import log from "../../utils/logger"

export const albumRouter = createRouter()
  .query("searchable", {
    async resolve({ ctx }) {
      return ctx.prisma.album.findMany({
        where: {
          tracks: {
            some: {}
          }
        },
        select: {
          id: true,
          name: true,
          artist: {
            select: {
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
          createdAt: true,
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

      if (album) {
        lastFm.findAlbum(input.id)
      } else {
        log("error", "404", "trpc", `album.miniature looked for unknown album by id ${input.id}`)
      }

      return {
        ...album,
        cover,
      }
    }
  })
  .query("get", {
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
          createdAt: true,
          _count: {
            select: {
              tracks: true,
            }
          },
          artist: {
            select: {
              id: true,
              name: true,
            }
          },
          tracks: {
            orderBy: {
              position: "asc"
            },
            select: {
              id: true,
              name: true,
              position: true,
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

      if (album) {
        lastFm.findAlbum(input.id)
      } else {
        log("error", "404", "trpc", `album.miniature looked for unknown album by id ${input.id}`)
      }

      return {
        ...album,
        cover,
      }
    },
  })

