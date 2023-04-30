import { type inferAsyncReturnType } from "@trpc/server"
import { type CreateNextContextOptions } from "@trpc/server/adapters/next"
import { prisma } from "../db/client"
import { isAuthed } from "server/common/server-auth"

type CreateContextOptions = {
  isAuthed: () => Promise<boolean | object>
}

/** Use this helper for:
 * - testing, so we dont have to mock Next.js' req/res
 * - trpc's `createSSGHelpers` where we don't have req/res
 * @see https://create.t3.gg/en/usage/trpc#-servertrpccontextts
 **/
export const createContextInner = async (opts: CreateContextOptions) => {
  return {
    isAuthed: opts.isAuthed,
    prisma,
  }
}

/**
 * This is the actual context you'll use in your router
 * @link https://trpc.io/docs/context
 **/
export const createContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts

  return await createContextInner({
    isAuthed: () => isAuthed(req, res),
  })
}

export type Context = inferAsyncReturnType<typeof createContext>
