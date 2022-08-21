import { createRouter } from "./context"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { env } from "../../env/server.mjs"
import { fetchAndWriteImage } from "../../utils/writeImage"
import lastfmImageToUrl from "../../utils/lastfmImageToUrl"
import sanitizeString from "../../utils/sanitizeString"

const lastFmTrackSchema = z
  .object({
    track: z.object({
      album: z.object({
        '@attr': z.object({
          position: z.string(),
        }).optional(),
        title: z.string(),
        mbid: z.string().optional(),
        artist: z.string(),
        image: z.array(z.object({
          '#text': z.string(),
          size: z.string(),
        })),
        url: z.string(),
      }).optional(),
      artist: z.object({
        name: z.string(),
        mbid: z.string().optional(),
        url: z.string(),
      }),
      toptags: z.object({
        tag: z.array(z.object({
          name: z.string(),
          url: z.string(),
        })),
      }),
      streamable: z.object({
        '#text': z.string(),
        fulltrack: z.string(),
      }),
      duration: z.string().transform(Number),
      listeners: z.string().transform(Number),
      mbid: z.string().optional(),
      name: z.string(),
      playcount: z.string().transform(Number),
      url: z.string(),
    }).optional(),
  })

const lastFmArtistSchema = z
  .object({
    artist: z.object({
      name: z.string(),
      mbid: z.string().optional(),
      url: z.string(),
      image: z.array(z.object({
        '#text': z.string(),
        size: z.string(),
      })),
      stats: z.object({
        listeners: z.string().transform(Number),
        playcount: z.string().transform(Number),
      }),
      tags: z.object({
        tag: z.array(z.object({
          name: z.string(),
          url: z.string(),
        })),
      }),
    }).optional(),
  })

const lastFmAlbumSchema = z
  .object({
    album: z.object({
      name: z.string(),
      artist: z.string(),
      id: z.string().optional(),
      mbid: z.string().optional(),
      url: z.string(),
      releasedate: z.string().optional().transform(Date),
      image: z.array(z.object({
        '#text': z.string(),
        size: z.string(),
      })),
      listeners: z.string().transform(Number),
      playcount: z.string().transform(Number),
      toptags: z.object({
        tag: z.array(z.object({
          name: z.string(),
          url: z.string(),
        })),
      }).optional(),
      tracks: z.object({
        track: z.union([
          z.array(z.object({
            name: z.string(),
            url: z.string(),
          })),
          z.object({})
        ]),
      }).optional(),
    }).optional(),
  })

export const lastfmRouter = createRouter()
  .query("track2", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input }) {
      // return lastFm.findTrack(input.id)
    }
  })
  .query("album", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input }) {
      // return lastFm.findAlbum(input.id)
    }
  })
  .query("artist", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input }) {
      // return lastFm.findArtist(input.id)
    }
  })
  .query("track", {
    input: z
      .object({
        id: z.string(),
        force: z.boolean().optional(),
      }),
    async resolve({ input, ctx }) {
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          lastfm: {
            include: {
              artist: true,
              album: true,
              tags: true,
            }
          },
          artist: {
            select: {
              id: true,
              name: true,
              lastfm: {
                include: {
                  tags: true,
                }
              }
            },
          },
          album: {
            select: {
              id: true,
              name: true,
              lastfm: {
                include: {
                  tags: true,
                }
              }
            }
          }
        }
      })
      if (!track) {
        throw new Error("Track not found")
      }
      if (!track.artist) {
        throw new Error("Track has no artist, not enough to get last.fm info")
      }
      let lastfmTrackId = track.lastfm?.id
      const lastfmAlbumId = track.album?.lastfm?.id
      let lastfmArtistId = track.artist.lastfm?.id
      if (!track.lastfm || input.force) {
        const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
        url.searchParams.set('method', 'track.getInfo')
        url.searchParams.set('format', 'json')
        url.searchParams.set('api_key', env.LAST_FM_API_KEY)
        url.searchParams.set('track', sanitizeString(track.name))
        url.searchParams.set('autocorrect', '1')
        url.searchParams.set('artist', sanitizeString(track.artist.name))
        const data = await fetch(url)
        const json = await data.json()
        const lastfm = lastFmTrackSchema.parse(json)
        if (lastfm.track && lastfm.track.url) {
          const data: Prisma.LastFmTrackCreateArgs['data'] & Prisma.LastFmTrackUpdateArgs['data'] = {
            entityId: track.id,
            ...(lastfmAlbumId ? { albumId: lastfmAlbumId } : {}),
            ...(lastfmArtistId ? { artistId: lastfmArtistId } : {}),
            url: lastfm.track.url,
            duration: lastfm.track.duration,
            listeners: lastfm.track.listeners,
            playcount: lastfm.track.playcount,
            mbid: lastfm.track.mbid,
            name: lastfm.track.name,
            tags: {
              connectOrCreate: lastfm.track.toptags.tag
                .filter(tag => tag.url)
                .map(tag => ({
                  where: { url: tag.url },
                  create: {
                    name: tag.name,
                    url: tag.url,
                  }
                }))
            },
          }
          const lastfmTrack = await ctx.prisma.lastFmTrack.upsert({
            where: { entityId: track.id },
            create: data,
            update: data,
          })
          lastfmTrackId = lastfmTrack.id
          if (lastfm.track.mbid) {
            await ctx.prisma.audioDbTrack.updateMany({
              where: { strMusicBrainzID: lastfm.track.mbid },
              data: { entityId: track.id },
            })
          }
        }
      }
      if (!track.artist.lastfm || input.force) {
        const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
        url.searchParams.set('method', 'artist.getInfo')
        url.searchParams.set('format', 'json')
        url.searchParams.set('api_key', env.LAST_FM_API_KEY)
        url.searchParams.set('autocorrect', '1')
        url.searchParams.set('artist', sanitizeString(track.artist.name))
        const data = await fetch(url)
        const json = await data.json()
        const lastfm = lastFmArtistSchema.parse(json)
        if (lastfm.artist && lastfm.artist.url) {
          let coverId 
          const image = lastfm.artist.image.at(-1)?.["#text"]
          if(image) {
            const {hash, path, mimetype, palette} = await fetchAndWriteImage(lastfmImageToUrl(image))
            if (hash) {
              const {id} = await ctx.prisma.image.upsert({
                where: { id: hash },
                update: {},
                create: {
                  id: hash as string,
                  path,
                  mimetype,
                  palette,
                }
              })
              coverId = id
            }
          }
          const lastfmArtist = await ctx.prisma.lastFmArtist.upsert({
            where: { entityId: track.artist.id },
            create: {
              entityId: track.artist.id,
              ...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
              ...(lastfmAlbumId ? { albums: { connect: { id: lastfmAlbumId } } } : {}),
              url: lastfm.artist.url,
              mbid: lastfm.artist.mbid,
              name: lastfm.artist.name,
              listeners: lastfm.artist.stats.listeners,
              playcount: lastfm.artist.stats.playcount,
              tags: {
                connectOrCreate: lastfm.artist.tags.tag.map(tag => ({
                  where: { url: tag.url },
                  create: {
                    name: tag.name,
                    url: tag.url,
                  }
                }))
              },
              coverUrl: image,
              coverId,
            },
            update: {
              ...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
              ...(lastfmAlbumId ? { albums: { connect: { id: lastfmAlbumId } } } : {}),
              url: lastfm.artist.url,
              mbid: lastfm.artist.mbid,
              name: lastfm.artist.name,
              listeners: lastfm.artist.stats.listeners,
              playcount: lastfm.artist.stats.playcount,
              tags: {
                connectOrCreate: lastfm.artist.tags.tag.map(tag => ({
                  where: { url: tag.url },
                  create: {
                    name: tag.name,
                    url: tag.url,
                  }
                }))
              },
              coverUrl: image,
              ...(coverId ? {cover: {
                connect: { id: coverId },
              }} : {}),
            },
          })
          lastfmArtistId = lastfmArtist.id
          if (lastfm.artist.mbid) {
            await ctx.prisma.audioDbArtist.updateMany({
              where: { strMusicBrainzID: lastfm.artist.mbid },
              data: { entityId: track.artist.id },
            })
          }
        }
      }
      if (track.album && (!track.album.lastfm || input.force)) {
        const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
        url.searchParams.set('method', 'album.getInfo')
        url.searchParams.set('format', 'json')
        url.searchParams.set('api_key', env.LAST_FM_API_KEY)
        url.searchParams.set('autocorrect', '1')
        url.searchParams.set('album', sanitizeString(track.album.name))
        url.searchParams.set('artist', sanitizeString(track.artist.name))
        const data = await fetch(url)
        const json = await data.json()
        const lastfm = lastFmAlbumSchema.parse(json)
        if (lastfm.album && lastfm.album.url) {
          let coverId
          const image = lastfm.album.image.at(-1)?.["#text"]
          if(image) {
            const {hash, path, mimetype, palette} = await fetchAndWriteImage(lastfmImageToUrl(image))
            if (hash) {
              const {id} = await ctx.prisma.image.upsert({
                where: { id: hash },
                update: {},
                create: {
                  id: hash as string,
                  path,
                  mimetype,
                  palette,
                }
              })
              coverId = id
            }
          }
          await ctx.prisma.lastFmAlbum.upsert({
            where: { entityId: track.album.id },
            create: {
              entityId: track.album.id,
              ...(lastfmArtistId ? { artistId: lastfmArtistId } : {}),
              ...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
              url: lastfm.album.url,
              mbid: lastfm.album.mbid,
              name: lastfm.album.name,
              listeners: lastfm.album.listeners,
              playcount: lastfm.album.playcount,
              ...(lastfm.album.toptags?.tag.length ? {
                tags: {
                  connectOrCreate: lastfm.album.toptags.tag.map(tag => ({
                    where: { url: tag.url },
                    create: {
                      name: tag.name,
                      url: tag.url,
                    }
                  }))
                }
              }: {}),
              coverUrl: image,
              coverId,
            },
            update: {
              ...(lastfmArtistId ? { artist: {connect: { id: lastfmArtistId } } } : {}),
              ...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
              url: lastfm.album.url,
              mbid: lastfm.album.mbid,
              name: lastfm.album.name,
              listeners: lastfm.album.listeners,
              playcount: lastfm.album.playcount,
              ...(lastfm.album.toptags?.tag.length ? {
                tags: {
                  connectOrCreate: lastfm.album.toptags.tag.map(tag => ({
                    where: { url: tag.url },
                    create: {
                      name: tag.name,
                      url: tag.url,
                    }
                  }))
                }
              }: {}),
              coverUrl: image,
              ...(coverId ? {cover: {
                connect: { id: coverId },
              }} : {}),
            },
          })
          if (lastfm.album.mbid) {
            await ctx.prisma.audioDbAlbum.updateMany({
              where: { strMusicBrainzID: lastfm.album.mbid },
              data: { entityId: track.album.id },
            })
          }
        }
      }
      if (!track.lastfm || !track.artist.lastfm || !track.album?.lastfm || input.force) {
        const updatedTrack = await ctx.prisma.track.findUnique({
          where: { id: track.id },
          select: {
            lastfm: {
              select: {
                id: true,
              }
            },
            artist: {
              select: {
                lastfm: {
                  select: {
                    id: true,
                  }
                }
              }
            },
            album: {
              select: {
                lastfm: {
                  select: {
                    id: true,
                  }
                }
              }
            }
          }
        })
        if (updatedTrack?.lastfm?.id) {
          await ctx.prisma.lastFmTrack.update({
            where: { id: updatedTrack.lastfm.id },
            data: {
              ...(updatedTrack.album?.lastfm?.id ? {
                album: {
                  connect: {
                    id: updatedTrack.album.lastfm.id
                  }
                }
              }: {}),
              ...(updatedTrack.artist?.lastfm?.id ? {
                artist: {
                  connect: {
                    id: updatedTrack.artist.lastfm.id
                  }
                }
              }: {}),
            }
          })
        }
      }
      return await ctx.prisma.lastFmTrack.findUnique({
        where: { entityId: track.id },
        include: {
          album: {
            include: {
              tags: true,
            }
          },
          artist: {
            include: {
              tags: true,
            }
          },
        }
      })
    },
  })
