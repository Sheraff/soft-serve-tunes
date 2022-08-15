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
  .query("miniature", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      return ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          name: true,
          metaImageId: true,
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
              thumbId: true,
              album: {
                select: {
                  strAlbum: true,
                  thumbId: true,
                  thumbHqId: true,
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
                  imageId: true,
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
                  coverId: true,
                }
              }
            }
          },
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
