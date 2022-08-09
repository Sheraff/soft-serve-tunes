import { createRouter } from "./context"
// import { z } from "zod"
import { Stats } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { parseFile } from 'music-metadata'
import { WebSocketServer } from 'ws'

if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
  throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER value in .env")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER
if (!process.env.NEXT_PUBLIC_WEBSOCKET_PORT) {
  throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER value in .env")
}
const websocketPort = Number(process.env.NEXT_PUBLIC_WEBSOCKET_PORT)

const populating: {
  promise: Promise<null> | null
  total: number
  done: number
} = {
  promise: null,
  total: 0,
  done: 0,
}

declare global {
  var socketServer: WebSocketServer | null;
}

if (!globalThis.socketServer || globalThis.socketServer.options.port !== websocketPort) {
  globalThis.socketServer?.close()
  const socketServer = new WebSocketServer({
    port: websocketPort,
  })
  socketServer.options.port
  socketServer.on('connection', (ws) => {
    console.log(`\x1b[35mevent\x1b[0m - WS Connection ++ (${socketServer.clients.size})`);
    ws.once('close', () => {
      console.log(`\x1b[35mevent\x1b[0m - WS Connection -- (${socketServer.clients.size})`);
    });
  });
  socketServer.on('error', (error) => {
    console.log(`\x1b[31merror\x1b[0m - WebSocket Server error: ${error}`);
  })
  socketServer.on('listening', () => {
    console.log(`\x1b[32mready\x1b[0m - WebSocket Server listening on ws://localhost:${websocketPort}`);
  })
  socketServer.on('connection', async (ws) => {
    let closed = false
    ws.on('close', () => closed = true)
    if (populating.promise) {
      const interval = setInterval(() => {
        if (!closed) {
          ws.send(JSON.stringify({type: 'progress', payload: populating.done / populating.total}))
        }
      }, 500)
      await populating.promise
      clearInterval(interval)
    }
    if (!closed) {
      ws.send(JSON.stringify({type: 'done'}))
      ws.close()
    }
  })
  globalThis.socketServer = socketServer
}

export const listRouter = createRouter()
  .query("all", {
    async resolve({ ctx }) {
      const tracks = await ctx.prisma.track.findMany({
        // orderBy: {
        //   name: "asc",
        // },
        include: {
          artist: {
            select: { name: true },
          },
          album: {
            select: { name: true },
          },
          genres: {
            select: {
              name: true,
            }
          }
        }
      })
      // tracks.sort((a, b) => {
      //   const aArtist = a.artist?.name
      //   const bArtist = b.artist?.name
      //   if (aArtist !== bArtist) {
      //     if(!aArtist) return -1
      //     if(!bArtist) return 1
      //     return aArtist.localeCompare(bArtist)
      //   }
      //   const aAlbum = a.album?.name
      //   const bAlbum = b.album?.name
      //   if (aAlbum !== bAlbum) {
      //     if(!aAlbum) return -1
      //     if(!bAlbum) return 1
      //     return aAlbum.localeCompare(bAlbum)
      //   }

      //   return a.name.localeCompare(b.name)
      // })
      return tracks
    }
  })
  .mutation("populate", {
    async resolve({ ctx }) {
      if (!populating.promise) {
        populating.total = 0
        populating.done = 0
        populating.promise = recursiveReaddirIntoDatabase()
          .then(() => populating.promise = null)
      }

      async function recursiveReaddirIntoDatabase(dirPath: string = '') {
        const dir = join(rootFolder, dirPath)
        const dirFiles = await readdir(dir)
        populating.total += dirFiles.length
        for (const file of dirFiles) {
          populating.done++
          if (file.startsWith('.')) {
            continue
          }
          const relativePath = join(dirPath, file)
          const filePath = join(rootFolder, relativePath)
          const stats = await stat(filePath)
          if (stats.isDirectory()) {
            await recursiveReaddirIntoDatabase(relativePath)
          } else if (stats.isFile()) {
            await createTrack(filePath, stats)
          } else {
            console.warn(`Unknown file type: ${relativePath}`)
          }
        }
        // return Promise.allSettled(dirFiles.map(async (file) => {
        //   if (file.startsWith('.')) {
        //     return
        //   }
        //   const relativePath = join(dirPath, file)
        //   const filePath = join(rootFolder, relativePath)
        //   const stats = await stat(filePath)
        //   if (stats.isDirectory()) {
        //     await recursiveReaddirIntoDatabase(relativePath)
        //   } else if (stats.isFile()) {
        //     await createTrack(filePath, stats)
        //   } else {
        //     console.warn(`Unknown file type: ${relativePath}`)
        //   }
        // }))
      }
      
      async function createTrack(path: string, stats: Stats, retries = 0) {
        const existingFile = await ctx.prisma.file.findUnique({where: {ino: stats.ino}})
        if (existingFile) {
          return
        }
        console.log(`Creating track for ${path}`)
        let metadata
        try {
          metadata = await parseFile(path)
        } catch (error) {
          console.warn('Parse error, probably not a music file', error)
          return
        }
        
        const uselessNameRegex = /^[0-9\s]*(track|piste)[0-9\s]*$/i
        const name = metadata.common.title && !uselessNameRegex.test(metadata.common.title)
          ? metadata.common.title
          : basename(path, extname(path))

        const position = metadata.common.track.no ?? undefined
      
        try {
          const track = await ctx.prisma.track.create({
            include: {
              feats: {
                select: {
                  id: true,
                }
              }
            },
            data: {
              name,
              position,
              popularity: 0,
              year: metadata.common.year,
              file: {
                create: {
                  path: path,
                  size: stats.size,
                  ino: stats.ino,
                  container: metadata.format.container ?? '*',
                  duration: metadata.format.duration ?? 0,
                  updatedAt: new Date(stats.mtimeMs),
                  createdAt: new Date(stats.ctimeMs),
                  birthTime: new Date(stats.birthtime),
                }
              },
              ...(metadata.common.picture?.[0]?.data ? {picture: {
                connectOrCreate: {
                  where: {
                    data: metadata.common.picture[0].data,
                  },
                  create: {
                    data: metadata.common.picture[0].data,
                    mime: metadata.common.picture[0].format
                  }
                }
              }} : {}),
              ...(metadata.common.artist ? {artist: {
                connectOrCreate: {
                  where: {
                    name: metadata.common.artist,
                  },
                  create: {
                    name: metadata.common.artist,
                  }
                }
              }} : {}),
              ...(metadata.common.artists?.length ? {feats: {
                connectOrCreate: metadata.common.artists.map(artist => ({
                  where: {
                    name: artist,
                  },
                  create: {
                    name: artist,
                  }
                }))
              }} : {}),
              ...(metadata.common.genre?.length ? {genres: {
                connectOrCreate: metadata.common.genre.map(genre => ({
                  where: {
                    name: genre,
                  },
                  create: {
                    name: genre,
                  }
                }))
              }} : {}),
            }
          })

          // update `feats` on secondary artists
          if (metadata.common.artists?.length) {
            await Promise.allSettled(track.feats.map(feat => {
              return ctx.prisma.artist.update({
                where: {
                  id: feat.id,
                },
                data: {
                  feats: {
                    connect: {
                      id: track.id,
                    }
                  }
                },
              })
            }))
          }

          // create album now that we have an artistId
          if(metadata.common.album) {
            const create = {
              name: metadata.common.album,
              artistId: track.artistId,
              year: metadata.common.year,
              tracksCount: metadata.common.track.of,
            }
            if(track.artistId) {
              await ctx.prisma.track.update({
                where: {
                  id: track.id,
                },
                data: {
                  album: {
                    connectOrCreate: {
                      where: {
                        name_artistId: {
                          name: metadata.common.album,
                          artistId: track.artistId
                        }
                      },
                      create
                    }
                  }
                }
              })
            } else {
              await ctx.prisma.track.update({
                where: {
                  id: track.id,
                },
                data: {
                  album: {
                    create
                  }
                }
              })
            }
          }
        } catch (e) {
          const name = basename(path, extname(path))
          if (retries < 6) {
            // wait to avoid race: random to stagger siblings, exponential to let the rest of the library go on
            const delay = 5 * Math.random() + 2**retries
            console.log(`Retrying in ${delay}ms (${name})`)
            await new Promise((resolve) => setTimeout(resolve, delay))
            await createTrack(path, stats, retries + 1)
          } else {
            console.warn(`Failed to create track ${name}`)
            console.warn(e)
          }
        }
      }
    }
  })
