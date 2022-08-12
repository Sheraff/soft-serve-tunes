import { createRouter } from "./context"
import { socketServer } from "../persistent/ws"
import type { WebSocket } from 'ws'
import createTrack from "../db/createTrack"
import listFilesFromDir from "../db/listFilesFromDir"
import { env } from "../../env/server.mjs"

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
  var persisted: {populated: boolean} | null;
}

const persisted = globalThis.persisted || {populated: false}

if (env.NODE_ENV !== "production") {
	globalThis.persisted = persisted
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
      if (persisted.populated) {
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
            persisted.populated = true
          })
      }
      return true
    }
  })

