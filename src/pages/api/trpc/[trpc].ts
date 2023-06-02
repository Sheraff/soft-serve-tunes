import { env } from "env/server.mjs"
import { createNextApiHandler } from "@trpc/server/adapters/next"
import { createContext } from "server/trpc/context"
import { appRouter } from "server/trpc/router/_app"

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createContext,
  batching: {
    enabled: true,
  },
  onError: env.NODE_ENV !== "production"
    ? ({ path, error }) => {
      console.error(`❌ tRPC failed on ${path}: ${error}`)
    }
    : undefined,
})
