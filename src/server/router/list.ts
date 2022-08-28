import { createRouter } from "./context"
import { socketServer } from "server/persistent/ws"
import type { WebSocket } from 'ws'
import createTrack from "server/db/createTrack"
import listFilesFromDir from "server/db/listFilesFromDir"
import { env } from "env/server.mjs"

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
    async resolve() {
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
          })
          .then(() => {
            populating.promise = null
            loadingStatus.populated = true
          })
      }
      return true
    }
  })

