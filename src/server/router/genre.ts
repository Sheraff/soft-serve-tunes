import { createRouter } from "./context"
import { z } from "zod"
import { prisma } from "server/db/client"
import { type Prisma } from "@prisma/client"

const nonEmptyGenreWhere: Exclude<Prisma.GenreFindManyArgs['where'], undefined> = {
  OR: [
    {tracks: {some: {}}},
    {subgenres: {some: {tracks: {some: {}}}}}
  ]
}

export async function recursiveSubGenres<
  TrackArgs extends Prisma.TrackFindManyArgs & {select: {id: true}}
>(
  id: string,
  args?: TrackArgs,
  tracks: Prisma.TrackGetPayload<TrackArgs>[] = [],
  genreSet: Set<string> = new Set(),
  trackSet: Set<string> = new Set()
) {
  genreSet.add(id)
  const data = await prisma.genre.findUnique({
    where: { id },
    select: {
      tracks: args || {select: {id: true}},
      subgenres: {
        select: {id: true},
        where: nonEmptyGenreWhere,
      },
    }
  }) as null | {
    tracks: Prisma.TrackGetPayload<TrackArgs>[]
    subgenres: {id: string}[]
  } // TS needs a little help here since it kept crashing or thinking `data` was Genre or even any.
  if (!data) return {tracks, genreSet}
  data.tracks.forEach(track => {
    if (!trackSet.has(track.id)) {
      tracks.push(track)
      trackSet.add(track.id)
    }
  })
  for (const genre of data.subgenres) {
    if (!genreSet.has(genre.id)) {
      await recursiveSubGenres(genre.id, args, tracks, genreSet, trackSet)
    }
  }
  return {tracks, genreSet}
}

function extendFromRecursive<
  Meta extends Record<string, any>,
  Keep extends boolean
>(
  meta: Meta,
  data: Awaited<ReturnType<typeof recursiveSubGenres>>,
  keepTracks: Keep
): Meta & {
  _count: {tracks: number, from: number}
  tracks: Keep extends true ? Awaited<ReturnType<typeof recursiveSubGenres>>['tracks'] : never
} {
  if (keepTracks) {
    return {
      ...meta,
      tracks: data.tracks,
      _count: {
        tracks: data.tracks.length,
        from: data.genreSet.size,
      }
    } as any // WARN: i didn't manage to type this, it might become a problem if i'm not careful
  } else {
    return {
      ...meta,
      _count: {
        tracks: data.tracks.length,
        from: data.genreSet.size,
      }
    } as any // WARN: i didn't manage to type this, it might become a problem if i'm not careful
  }
}

export const genreRouter = createRouter()
  .query("miniature", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const meta = await ctx.prisma.genre.findUnique({
        where: {id: input.id},
        select: {name: true, id: true}
      })
      if (!meta) return meta
      const data = await recursiveSubGenres(input.id)
      return extendFromRecursive(meta, data, false)
    },
  })
  .query("get", {
    input: z
      .object({
        id: z.string(),
      }),
    async resolve({ input, ctx }) {
      const meta = await ctx.prisma.genre.findUnique({
        where: {id: input.id},
        select: {
          id: true,
          name: true,
          subgenres: {
            where: nonEmptyGenreWhere,
            select: {id: true, name: true},
          },
          supgenres: {
            where: nonEmptyGenreWhere,
            select: {id: true, name: true},
          },
        },
      })
      if (!meta) return meta
      const fullMeta = {
        ...meta,
        supgenres: await Promise.all(meta.supgenres.map(async (genre) => {
          const data = await recursiveSubGenres(genre.id)
          return extendFromRecursive(genre, data, false)
        })),
        subgenres: await Promise.all(meta.subgenres.map(async (genre) => {
          const data = await recursiveSubGenres(genre.id)
          return extendFromRecursive(genre, data, false)
        })),
      }
      const data = await recursiveSubGenres(input.id)
      const result = await extendFromRecursive(fullMeta, data, true)
      return result
    },
  })
  .query("list", {
    async resolve({ ctx }) {
      return await ctx.prisma.genre.findMany({
        where: nonEmptyGenreWhere,
        orderBy: { name: "asc" },
        select: { name: true, id: true }
      })
    }
  })
  .query("most-fav", {
    async resolve({ ctx }) {
      const seed = await ctx.prisma.genre.findMany({
        where: nonEmptyGenreWhere,
        select: { name: true, id: true }
      })
      const list = await Promise.all(seed.map(async (genre) => {
        const data = await recursiveSubGenres(genre.id, {
          where: {userData: {favorite: true}},
          select: {id: true},
        })
        return extendFromRecursive(genre, data, false)
      }))
      const mostLiked = list
        .sort((a, b) => (b._count.tracks / (b._count.from + 1)) - (a._count.tracks / (a._count.from + 1)))
        .slice(0, 10)
        .map(({id, name}) => ({id, name}))
      return mostLiked
    }
  })

