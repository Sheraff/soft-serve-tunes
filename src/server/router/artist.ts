import { createRouter } from "./context"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { audiodb } from "server/persistent/audiodb"
import log from "utils/logger"

export const artistRouter = createRouter()
  .query("searchable", {
    async resolve({ctx}) {
      return ctx.prisma.artist.findMany({
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
        select: {
          id: true,
          name: true,
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
      const artist = await ctx.prisma.artist.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          _count: {
            select: {
              albums: true,
              tracks: true,
            },
          },
          audiodb: {
            select: {
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              // cutout: {
              //   select: {
              //     id: true,
              //     palette: true,
              //   }
              // },
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
      // if (artist?.audiodb?.cutout) {
      //   cover = artist.audiodb.cutout
      // } else 
      if (artist?.audiodb?.thumb) {
        cover = artist.audiodb.thumb
      } else if (artist?.spotify?.image) {
        cover = artist.spotify.image
      } else if (artist?.tracks?.[0]?.metaImage) {
        cover = artist.tracks[0].metaImage
      }

      if (artist) {
        lastFm.findArtist(input.id)
        audiodb.fetchArtist(input.id)
      } else {
        log("error", "404", "trpc", `artist.miniature looked for unknown artist by id ${input.id}`)
      }

      return {
        ...artist,
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
      const artist = await ctx.prisma.artist.findUnique({
        where: { id: input.id },
        select: {
          name: true,
          _count: {
            select: {
              albums: true,
              tracks: true,
            },
          },
          albums: {
            select: {
              id: true,
            },
          },
          audiodb: {
            select: {
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

      if (artist) {
        lastFm.findArtist(input.id)
        audiodb.fetchArtist(input.id)
      } else {
        log("error", "404", "trpc", `artist.get looked for unknown artist by id ${input.id}`)
      }

      return {
        ...artist,
        cover,
      }
    },
  })
  .query("most-fav", {
    async resolve({ ctx }) {
      return ctx.prisma.artist.findMany({
        where: { userData: { favorite: { gt: 0 } } },
        orderBy: { userData: { favorite: "desc" } },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })
  .query("most-recent-listen", {
    async resolve({ ctx }) {
      return ctx.prisma.artist.findMany({
        where: { userData: { isNot: null } },
        orderBy: { userData: { lastListen: "desc" } },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })
  .query("most-recent-add", {
    async resolve({ ctx }) {
      return ctx.prisma.artist.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, name: true },
      })
    }
  })

