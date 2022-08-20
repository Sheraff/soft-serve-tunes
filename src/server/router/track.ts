import { createRouter } from "./context";
import { z } from "zod";

export const trackRouter = createRouter()
  .query("searchable", {
    async resolve({ ctx }) {
      return ctx.prisma.track.findMany({
        select: {
          id: true,
          name: true,
          artist: {
            select: {
              name: true,
            },
          },
          album: {
            select: {
              name: true,
            },
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
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          createdAt: true,
          metaImage: {
            select: {
              id: true,
              palette: true,
            }
          },
          album: {
            select: {
              name: true,
            }
          },
          artist: {
            select: {
              name: true,
            }
          },
          audiodb: {
            select: {
              intDuration: true,
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              album: {
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
            }
          },
          spotify: {
            select: {
              durationMs: true,
              album: {
                select: {
                  image: {
                    select: {
                      id: true,
                      palette: true,
                    }
                  },
                }
              },
            }
          },
          lastfm: {
            select: {
              duration: true,
              album: {
                select: {
                  cover: {
                    select: {
                      id: true,
                      palette: true,
                    }
                  },
                }
              }
            }
          },
        }
      })
      if (!track) return null
      let cover = undefined
      if (track.spotify?.album?.image) {
        cover = track.spotify.album?.image
      } else if (track.audiodb?.thumb) {
        cover = track.audiodb.thumb
      } else if (track.audiodb?.album.thumbHq) {
        cover = track.audiodb.album.thumbHq
      } else if (track.audiodb?.album.thumb) {
        cover = track.audiodb.album.thumb
      } else if (track.lastfm?.album?.cover) {
        cover = track.lastfm.album.cover
      } else if (track.metaImage) {
        cover = track.metaImage
      }
      return {...track, cover}
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
