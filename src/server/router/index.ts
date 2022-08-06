import { createRouter } from "./context"
import superjson from "superjson"

import { exampleRouter } from "./example"
import { listRouter } from "./list"

export const appRouter = createRouter()
  .transformer(superjson)
  .merge("example.", exampleRouter)
  .merge("list.", listRouter)

// export type definition of API
export type AppRouter = typeof appRouter
