// src/server/db/client.ts
import { PrismaClient } from "@prisma/client"
import { env } from "env/server.mjs"

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: env.NODE_ENV !== "production"
      ? ["info", "warn", "error"] // "query"
      : ["warn", "error"],
  })

if (env.NODE_ENV !== "production") {
  global.prisma = prisma
}

const signalHandler = () => prisma.$disconnect()
process.on('SIGINT', signalHandler)
process.on('SIGTERM', signalHandler)
process.on('SIGQUIT', signalHandler)
