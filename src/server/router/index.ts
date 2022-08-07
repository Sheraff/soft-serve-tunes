import { createRouter } from "./context"
import superjson from "superjson"

import { exampleRouter } from "./example"
import { listRouter } from "./list"
import { lastfmRouter } from "./lastfm"
import { metadataRouter } from "./metadata"

export const appRouter = createRouter()
  .transformer(superjson)
  .merge("example.", exampleRouter)
  .merge("list.", listRouter)
  .merge("lastfm.", lastfmRouter)
  .merge("metadata.", metadataRouter)

// export type definition of API
export type AppRouter = typeof appRouter
