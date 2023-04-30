import type { NextApiRequest, NextApiResponse } from "next"
import { env } from "env/server.mjs"
import { createNextApiHandler } from "@trpc/server/adapters/next"
import { createContext } from "server/trpc/context"
import { appRouter } from "server/trpc/router/_app"

// export API handler
const trpcHandler = createNextApiHandler({
  router: appRouter,
  createContext: createContext,
  batching: {
    enabled: true, // somehow disabling this breaks the populate request
  },
  onError: env.NODE_ENV !== "production"
    ? ({ path, error }) => {
      console.error(`❌ tRPC failed on ${path}: ${error}`)
    }
    : undefined,
})

export default function handler (req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Access-Control-Allow-Headers", `Content-Type, Authorization`)
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }
  return trpcHandler(req, res)
}
