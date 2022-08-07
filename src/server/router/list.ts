import { createRouter } from "./context"
import { z } from "zod"
import { Stats } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { parseFile } from 'music-metadata'
import WebSocket, { WebSocketServer } from 'ws'


if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
	throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER value in .env")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER

const socketServer = new WebSocketServer({
  port: 8080,
  path: '/api/list/populate',
  host: 'localhost',
})

export const listRouter = createRouter()
  .query("all", {
    async resolve({ ctx }) {
      const tracks = await ctx.prisma.track.findMany({
        orderBy: {
          name: "asc",
        },
        include: {
          artists: {
            select: {
              artist: {
                select: { name: true },
              },
            }
          }
        }
      })
      tracks.sort((a, b) => {
        const aArtist = a.artists?.[0]?.artist?.name
        const bArtist = b.artists?.[0]?.artist?.name
        if (aArtist !== bArtist) {
          if(!aArtist) return -1
          if(!bArtist) return 1
          return aArtist.localeCompare(bArtist)
        }
        return a.name.localeCompare(b.name)
      })
      return tracks
    }
  })
  .mutation("populate", {
    async resolve({ ctx }) {
      const onConnection = async (ws: WebSocket.WebSocket) => {
        await recursiveReaddirIntoDatabase()
        ws.send('done')
        socketServer.removeListener('connection', onConnection)
      }
      socketServer.addListener('connection', onConnection)
      setTimeout(() => {
        socketServer.removeListener('connection', onConnection)
      }, 30_000)

      async function recursiveReaddirIntoDatabase(dirPath: string = '') {
        const dir = join(rootFolder, dirPath)
        const dirFiles = await readdir(dir)
        // for (const file of dirFiles) {
        return Promise.allSettled(dirFiles.map(async (file) => {
          if (file.startsWith('.')) {
            return
            // continue
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
        }))
        // }
      }
      
      async function createTrack(path: string, stats: Stats) {
        const existing = await ctx.prisma.file.findUnique({where: {ino: stats.ino}})
        if (existing) {
          return
        }
        console.log(`Creating track for ${path}`)
        const metadata = await parseFile(path)
        
        const uselessNameRegex = /^[0-9\s]*(track|piste)[0-9\s]*$/i
        const name = metadata.common.title && !uselessNameRegex.test(metadata.common.title)
          ? metadata.common.title
          : basename(path, extname(path))
      
        try {
          const artistStrings = new Set<string>()
          if (metadata.common.artist) {
            artistStrings.add(metadata.common.artist)
          }
          if (metadata.common.artists) {
            metadata.common.artists.forEach(artist => artistStrings.add(artist))
          }
          const artists = await Promise.all(Array.from(artistStrings).map(async (artist) => {
            const existing = await ctx.prisma.artist.findUnique({
              where: { name: artist },
              select: { id: true },
            })
            if (existing) {
              return existing.id
            }
            const created = await ctx.prisma.artist.create({
              data: { name: artist },
            })
            return created.id
          }))
          await ctx.prisma.file.create({
            data: {
              path: path,
              size: stats.size,
              ino: stats.ino,
              container: metadata.format.container,
              duration: metadata.format.duration ?? 0,
              updatedAt: new Date(stats.mtimeMs),
              createdAt: new Date(stats.ctimeMs),
              birthTime: new Date(stats.birthtime),
              // trackId: track.id,
              track: {
                create: {
                  name,
                  // artists,
                  // albums,
                  popularity: 0,
                  year: metadata.common.year,
                  // genres,
                  // pictureId: cover,
                  picture: metadata.common.picture?.[0]?.data
                    ? {
                      connectOrCreate: {
                        where: {
                          data: metadata.common.picture[0].data,
                        },
                        create: {
                          data: metadata.common.picture[0].data,
                          mime: metadata.common.picture[0].format
                        }
                      }
                    }
                    : undefined,
                  artists: {
                    create: artists.map(artist => ({
                      artistId: artist,
                    })),
                  }
                }
              },
            },
          })
          console.log(`Added ${path}`)
          console.log(`should have created artist ${metadata.common.artist} / ${metadata.common.artists}`)
          console.log(`should have created album ${metadata.common.album}`)
          console.log(`should have created genre ${metadata.common.genre}`)
        } catch (e) {
          console.error(e)
        }
      }
    }
  })
