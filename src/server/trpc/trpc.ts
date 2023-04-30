import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"

import { type Context } from "./context"

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter ({ shape }) {
    return shape
  },
})

export const router = t.router

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure

/**
 * Reusable middleware to ensure
 * users are logged in
 */
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!await ctx.isAuthed()) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next()
})

/**
 * Protected procedure
 **/
export const protectedProcedure = t.procedure.use(isAuthed)
