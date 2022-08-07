import { createRouter } from "./context"
import superjson from "superjson"

import { listRouter } from "./list"
import { lastfmRouter } from "./lastfm"
import { metadataRouter } from "./metadata"

export const appRouter = createRouter()
  .transformer(superjson)
  .merge("list.", listRouter)
  .merge("lastfm.", lastfmRouter)
  .merge("metadata.", metadataRouter)

// export type definition of API
export type AppRouter = typeof appRouter
