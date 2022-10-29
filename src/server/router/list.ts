import { createRouter } from "./context"
import { socketServer } from "server/persistent/ws"
import { fileWatcher } from "server/persistent/watcher"
import type { WebSocket } from 'ws'
import createTrack from "server/db/createTrack"
import listFilesFromDir from "server/db/listFilesFromDir"
import { env } from "env/server.mjs"
import log from "utils/logger"

const populating: {
  promise: Promise<null | void> | null
  total: number
  done: number
} = {
  promise: null,
  total: 0,
  done: 0,
}

declare global {
  // eslint-disable-next-line no-var
  var loadingStatus: {populated: boolean} | null
}

export const loadingStatus = globalThis.loadingStatus || {populated: false}

if (env.NODE_ENV !== "production") {
  globalThis.loadingStatus = loadingStatus
}

socketServer.registerActor('populate:subscribe', async (ws: WebSocket) => {
  if (populating.promise) {
    const interval = setInterval(() => {
      if (socketServer.isAlive(ws)) {
        const progress = populating.total
          ? populating.done / populating.total
          : 0
        ws.send(JSON.stringify({type: 'populate:progress', payload: progress}))
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
    async resolve({ctx}) {
      if (loadingStatus.populated) {
        return false
      }
      if (!populating.promise) {
        populating.total = 0
        populating.done = 0
        populating.promise = listFilesFromDir()
          .then(async (list) => {
            populating.total = list.length
            for (const file of list) {
              await createTrack(file)
              populating.done++
            }

            // remove tracks without files
            try {
              const orphanTracks = await ctx.prisma.track.findMany({
                where: {file: {is: null}},
                select: {id: true, name: true}
              })
              for (const track of orphanTracks) {
                await ctx.prisma.track.delete({
                  where: { id: track.id },
                })
                log("event", "event", "fswatcher", `track ${track.name} removed because no associated file was found`)
              }

              // remove database records of files that have no filesystem file
              const dbFiles = await ctx.prisma.file.findMany({
                where: {path: {notIn: list}}, // WARN: `list` might be huge, if this becomes a problem, iterate (paginated) over all DB files and check for match in the filesystem
                select: { path: true }
              })
              for (const dbFile of dbFiles) {
                await fileWatcher.removeFileFromDb(dbFile.path)
              }

              if (dbFiles.length || orphanTracks.length) {
                fileWatcher.scheduleCleanup()
              }
            } catch (e) {
              // catching error because lack of cleanup shouldn't prevent app from starting up
              console.error('error depopulating database')
              console.error(e)
            }
          })
          .then(() => {
            populating.promise = null
            loadingStatus.populated = true
          })
      }
      return true
    }
  })

