import { createRouter } from "./context"
import { socketServer } from "../persistent/ws"
import type { WebSocket } from 'ws'
import createTrack from "../db/createTrack"
import listFilesFromDir from "../db/listFilesFromDir"

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
        populating.promise = listFilesFromDir()
          .then(async (list) => {
            populating.total = list.length
            for (const file of list) {
              await createTrack(file)
              populating.done++
            }
          })
          .then(() => populating.promise = null)
      }
    }
  })
