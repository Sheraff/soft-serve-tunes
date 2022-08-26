import { createRouter } from "./context"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { spotify } from "server/persistent/spotify"
import { socketServer } from "server/persistent/ws"
import log from "utils/logger"
import { TRPCError } from "@trpc/server"

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
          position: true,
          metaImage: {
            select: {
              id: true,
              palette: true,
            }
          },
          userData: {
            select: {
              favorite: true,
            }
          },
          album: {
            select: {
              name: true,
              spotify: { select: {image: true} },
              audiodb: { select: {thumbHq: true, thumb: true} },
              lastfm: { select: {cover: true} },
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
      if (track?.album?.spotify?.image) {
        log("info", "image", "trpc", `track.miniature selected cover from track.album.spotify.image for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.album.spotify.image
      } else if (track?.album?.audiodb?.thumbHq) {
        log("info", "image", "trpc", `track.miniature selected cover from track.album.audiodb.thumbHq for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.album.audiodb.thumbHq
      } else if (track?.album?.audiodb?.thumb) {
        log("info", "image", "trpc", `track.miniature selected cover from track.album.audiodb.thumb for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.album.audiodb.thumb
      } else if (track.spotify?.album?.image) {
        log("info", "image", "trpc", `track.miniature selected cover from spotify.album for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.spotify.album?.image
      } else if (track.audiodb?.thumb) {
        log("info", "image", "trpc", `track.miniature selected cover from audiodb.thumb for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.audiodb.thumb
      } else if (track.audiodb?.album.thumbHq) {
        log("info", "image", "trpc", `track.miniature selected cover from audiodb.album.thumbHq for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.audiodb.album.thumbHq
      } else if (track.audiodb?.album.thumb) {
        log("info", "image", "trpc", `track.miniature selected cover from audiodb.album.thumb for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.audiodb.album.thumb
      } else if (track.lastfm?.album?.cover) {
        log("info", "image", "trpc", `track.miniature selected cover from lastfm.album.cover for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.lastfm.album.cover
      } else if (track.metaImage) {
        log("info", "image", "trpc", `track.miniature selected cover from track.metaImage for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.metaImage
      } else if (track?.album?.lastfm?.cover) {
        log("info", "image", "trpc", `track.miniature selected cover from track.album.lastfm.cover for ${track.name} by ${track.artist?.name} in ${track.album?.name}`)
        cover = track.album.lastfm.cover
      }

      if (track) {
        lastFm.findTrack(input.id)
        spotify.findTrack(input.id)
      } else {
        log("error", "404", "trpc", `track.miniature looked for unknown track by id ${input.id}`)
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
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const now = new Date().toISOString()
      const track = await ctx.prisma.track.update({
        where: { id: input.id },
        select: {
          albumId: true,
          artistId: true,
        },
        data: {
          userData: {
            upsert: {
              update: {
                playcount: { increment: 1 },
                lastListen: now,
              },
              create: {
                playcount: 1,
                lastListen: now,
              }
            }
          }
        }
      })
      if (track.albumId) {
        await ctx.prisma.album.update({
          where: { id: track.albumId },
          data: {
            userData: {
              upsert: {
                update: {
                  playcount: { increment: 1 },
                  lastListen: now,
                },
                create: {
                  playcount: 1,
                  lastListen: now,
                }
              }
            }
          }
        })
        socketServer.send("invalidate:album", {id: track.albumId})
      }
      if (track.artistId) {
        await ctx.prisma.artist.update({
          where: { id: track.artistId },
          data: {
            userData: {
              upsert: {
                update: {
                  playcount: { increment: 1 },
                  lastListen: now,
                },
                create: {
                  playcount: 1,
                  lastListen: now,
                }
              }
            }
          }
        })
        socketServer.send("invalidate:artist", {id: track.artistId})
      }
      socketServer.send("invalidate:track", {id: input.id})
    }
  })
  .mutation("like", {
    input: z
      .object({
        id: z.string(),
        toggle: z.boolean(),
      }),
    async resolve({ input, ctx }) {
      if (!ctx.session || !ctx.session.user) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const track = await ctx.prisma.track.update({
        where: { id: input.id },
        select: {
          albumId: true,
          artistId: true,
        },
        data: {
          userData: {
            upsert: {
              update: {
                favorite: input.toggle,
              },
              create: {
                favorite: input.toggle,
              }
            }
          }
        }
      })
      const kind = input.toggle ? 'increment' : 'decrement'
      const init = input.toggle ? 1 : 0
      if (track.albumId) {
        await ctx.prisma.album.update({
          where: { id: track.albumId },
          data: {
            userData: {
              upsert: {
                update: {
                  favorite: { [kind]: 1 },
                },
                create: {
                  favorite: init,
                }
              }
            }
          }
        })
        socketServer.send("invalidate:album", {id: track.albumId})
      }
      if (track.artistId) {
        await ctx.prisma.artist.update({
          where: { id: track.artistId },
          data: {
            userData: {
              upsert: {
                update: {
                  favorite: { [kind]: 1 },
                },
                create: {
                  favorite: init,
                }
              }
            }
          }
        })
        socketServer.send("invalidate:artist", {id: track.artistId})
      }
      socketServer.send("invalidate:track", {id: input.id})
      return track
    }
  })
  .query("most-danceable", {
    async resolve({ ctx }) {
      return ctx.prisma.track.findMany({
        // where: { spotify: { danceability: { gt: 0 } } },
        orderBy: { spotify: { danceability: "desc" } },
        take: 5,
        include: {
          spotify: {
            select: {
              danceability: true,
            }
          }
        }
      })
    }
  })
