import { createRouter } from "./context";
import { z } from "zod";

export const lastfmRouter = createRouter()
  .query("track", {
    input: z
      .object({
        id: z.string(),
      }),
    output: z
      .object({
        track: z.object({
          album: z.object({
            '@attr': z.object({
              position: z.string(),
            }),
            title: z.string(),
            mbid: z.string().optional(),
            artist: z.string(),
            image: z.array(z.object({
              '#text': z.string(),
              size: z.string(),
            })),
            url: z.string(),
          }).optional(),
          artist: z.object({
            name: z.string(),
            mbid: z.string().optional(),
            url: z.string(),
          }),
          toptags: z.object({
            tag: z.array(z.object({
              name: z.string(),
              url: z.string(),
            })),
          }),
          streamable: z.object({
            '#text': z.string(),
            fulltrack: z.string(),
          }),
          duration: z.string().transform(Number),
          listeners: z.string().transform(Number),
          mbid: z.string().optional(),
          name: z.string(),
          playcount: z.string().transform(Number),
          url: z.string(),
        })
      }),
    async resolve({ input, ctx }) {
      if(!process.env.LAST_FM_API_KEY) {
        throw new Error("Missing LAST_FM_API_KEY value in .env")
      }
      const track = await ctx.prisma.track.findUnique({
        where: { id: input.id },
        select: {
          name: true,
          artist: {
            select: { name: true },
          }
        }
      })
      if (!track) {
        throw new Error("Track not found")
      }
      if (!track.artist) {
        throw new Error("Track has no artist, not enough to get last.fm info")
      }
      const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
      url.searchParams.set('method', 'track.getInfo')
      url.searchParams.set('format', 'json')
      url.searchParams.set('api_key', process.env.LAST_FM_API_KEY)
      url.searchParams.set('track', track.name)
      url.searchParams.set('autocorrect', '1')
      url.searchParams.set('artist', track.artist.name)
      const data = await fetch(url)
      const json = await data.json()
      console.log(json)
      return json
    },
  })
