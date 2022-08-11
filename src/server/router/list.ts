import { createRouter } from "./context"
// import { z } from "zod"
import { Stats } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { parseFile } from 'music-metadata'
import { env } from "../../env/server.mjs"
import { socketServer } from "../ws"
import type { WebSocket } from 'ws'

const populating: {
  promise: Promise<null> | null
  total: number
  done: number
} = {
  promise: null,
  total: 0,
  done: 0,
}

socketServer.registerActor('populate:subscribe', async (ws: WebSocket) => {
  if (populating.promise) {
    const interval = setInterval(() => {
      if (socketServer.isAlive(ws)) {
        ws.send(JSON.stringify({type: 'populate:progress', payload: populating.done / populating.total}))
      } else {
        clearInterval(interval)
      }
    }, 500)
    await populating.promise
    clearInterval(interval)
  }
  if (socketServer.isAlive(ws)) {
    ws.send(JSON.stringify({type: 'populate:done'}))
  }
})

export const listRouter = createRouter()
  .mutation("populate", {
    async resolve({ ctx }) {
      if (!populating.promise) {
        populating.total = 0
        populating.done = 0
        populating.promise = recursiveReaddirListFiles()
          .then(async (list) => {
            for (const file of list) {
              await createTrack(file)
              populating.done++
            }
          })
          .then(() => populating.promise = null)
      }

      async function recursiveReaddirListFiles(dirPath: string = '', fileList: string[] = []): Promise<string[]> {
        const dir = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, dirPath)
        const dirFiles = await readdir(dir)
        for (const file of dirFiles) {
          if (file.startsWith('.')) {
            continue
          }
          const relativePath = join(dirPath, file)
          const filePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, relativePath)
          const stats = await stat(filePath)
          if (stats.isDirectory()) {
            await recursiveReaddirListFiles(relativePath, fileList)
          } else if (stats.isFile()) {
            fileList.push(filePath)
            populating.total++
          } else {
            console.warn(`Unknown file type: ${relativePath}`)
          }
        }
        return fileList
      }

      async function createTrack(path: string, retries = 0) {
        const stats = await stat(path)
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
