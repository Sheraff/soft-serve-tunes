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
              palette: true,
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
              strTrack: true,
              thumb: {
                select: {
                  id: true,
                  palette: true,
                }
              },
              album: {
                select: {
                  strAlbum: true,
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
                  artist: {
                    select: {
                      strArtist: true,
                    }
                  }
                }
              },
            }
          },
          spotify: {
            select: {
              name: true,
              album: {
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
              }
            }
          },
          lastfm: {
            select: {
              name: true,
              artist: {
                select: {
                  name: true,
                }
              },
              album: {
                select: {
                  name: true,
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
