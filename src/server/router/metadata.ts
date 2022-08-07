import { createRouter } from "./context";
import { z } from "zod";
import { parseFile } from "music-metadata";

export const metadataRouter = createRouter()
  .query("track", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          file: {
            select: {
              path: true,
            }
          }
        }
      })
      if (!track) {
        throw new Error("Track not found")
      }
      if (!track?.file) {
        throw new Error("Track has associated file to parse metadata from")
      }
      const {format, common: {picture, ...common}} = await parseFile(track.file.path)
      return {format, common}
    },
  })
