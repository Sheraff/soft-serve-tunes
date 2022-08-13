import { createRouter } from "./context"
import { z } from "zod"
import { findTrack } from "../persistent/spotify"

export const spotifyRouter = createRouter()
  .query("track", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      await findTrack(input.id)
      return ctx.prisma.spotifyTrack.findUnique({
        where: { trackId: input.id },
        include: {
          artist: true,
          album: true,
        }
      })
    },
  })

