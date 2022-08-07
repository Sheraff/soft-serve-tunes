import { createRouter } from "./context";
import { z } from "zod";

export const listRouter = createRouter()
  .query("all", {
    async resolve({ ctx }) {
      return await ctx.prisma.track.findMany()
    }
  })
  // .mutation("populate", {
  //   async resolve({ ctx }) {
  //     console.log(ctx)
  //     return await ctx.prisma.track.create({
  //       data: {
  //         name: "test",
  //         duration: 10,
  //       }
  //     })
  //   }
  // })
