import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { prisma } from "server/db/client"
import { type Prisma } from "@prisma/client"

const nonEmptyGenreWhere: Exclude<Prisma.GenreFindManyArgs["where"], undefined> = {
  OR: [
    { tracks: { some: {} } },
    { subgenres: { some: {} } }
  ]
}

export async function recursiveSubGenres<
  TrackArgs extends Prisma.TrackFindManyArgs & { select: { id: true } },
> (
  id: string,
  args?: TrackArgs,
  callback?: (track: Prisma.TrackGetPayload<TrackArgs>, depth: number) => void,
  tracks: Prisma.TrackGetPayload<TrackArgs>[] = [],
  genreSet: Set<string> = new Set(),
  trackSet: Set<string> = new Set(),
  depth = 0
) {
  genreSet.add(id)
  const tracksArg = args || { select: { id: true } }
  // TODO: we might want to also select album>tracks in addition to tracks,
  // musicbrainz reports having a lot of genre connections on albums (49% of albums have at least 1 genre),
  // but don't report anything on tracks
  const data = await prisma.genre.findUnique({
    where: { id },
    select: {
      tracks: tracksArg,
      audiodbTracks: {
        ...("where" in tracksArg ? { where: { entity: tracksArg.where } } : {}),
        select: { entity: { select: tracksArg.select } }
      },
      subgenres: {
        select: { id: true },
        where: nonEmptyGenreWhere,
      },
    }
  }) as null | {
    tracks: Prisma.TrackGetPayload<TrackArgs>[]
    audiodbTracks: { entity: Prisma.TrackGetPayload<TrackArgs> | null }[]
    subgenres: { id: string }[]
  } // TS needs a little help here since it kept crashing or thinking `data` was Genre or even any.
  if (!data) return { tracks, genreSet }
  const audiodbTracks = data.audiodbTracks.reduce<Prisma.TrackGetPayload<TrackArgs>[]>((array, { entity }) => {
    if (entity) array.push(entity)
    return array
  }, [])
  const allTracks = data.tracks.concat(audiodbTracks)
  allTracks.forEach(track => {
    if (!trackSet.has(track.id)) {
      tracks.push(track)
      trackSet.add(track.id)
      if (callback) {
        callback(track, depth)
      }
    }
  })
  for (const genre of data.subgenres) {
    if (!genreSet.has(genre.id)) {
      await recursiveSubGenres(genre.id, args, callback, tracks, genreSet, trackSet, depth + 1)
    }
  }
  return { tracks, genreSet }
}

function extendFromRecursive<
  Meta extends Record<string, any>,
  Keep extends boolean
> (
  meta: Meta,
  data: Awaited<ReturnType<typeof recursiveSubGenres>>,
  keepTracks: Keep
): Meta & {
  _count: { tracks: number, from: number }
  tracks: Keep extends true ? Awaited<ReturnType<typeof recursiveSubGenres>>["tracks"] : never
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

async function recursiveNonEmpty (id: string, genreSet: Set<string> = new Set()) {
  genreSet.add(id)
  const data = await prisma.genre.findUnique({
    where: { id },
    select: {
      tracks: { take: 1 },
      subgenres: {
        select: { id: true },
        where: nonEmptyGenreWhere,
      },
    }
  })
  if (!data) return false
  if (data.tracks.length) return true
  for (const sub of data.subgenres) {
    const res = await recursiveNonEmpty(sub.id, genreSet)
    if (res) return true
  }
  return false
}

const miniature = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const meta = await ctx.prisma.genre.findUnique({
    where: { id: input.id },
    select: { name: true, id: true }
  })
  if (!meta) return meta
  const data = await recursiveSubGenres(input.id)
  return extendFromRecursive(meta, data, false)
})

const get = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const meta = await ctx.prisma.genre.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      name: true,
      subgenres: {
        where: nonEmptyGenreWhere,
        select: { id: true, name: true },
      },
      supgenres: {
        where: nonEmptyGenreWhere,
        select: { id: true, name: true },
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
})

const list = publicProcedure.query(async ({ ctx }) => {
  const seed = await ctx.prisma.genre.findMany({
    where: nonEmptyGenreWhere,
    orderBy: { name: "asc" },
    select: { name: true, id: true }
  })
  const keep: Array<typeof seed[number]> = []
  for (const genre of seed) {
    if (await recursiveNonEmpty(genre.id))
      keep.push(genre)
  }
  return keep
})

const mostFav = publicProcedure.query(async ({ ctx }) => {
  const seed = await ctx.prisma.genre.findMany({
    where: nonEmptyGenreWhere,
    select: { name: true, id: true }
  })
  const list = await Promise.all(seed.map(async (genre) => {
    let genreFavScore = 0
    await recursiveSubGenres(
      genre.id,
      {
        where: { userData: { favorite: true } },
        select: { id: true },
      },
      (_, depth) => {
        genreFavScore += 1 / (depth ** 2 + 1)
      }
    )
    return {
      id: genre.id,
      name: genre.name,
      score: genreFavScore,
    }
  }))
  const mostLiked = list
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ id, name }) => ({ id, name }))
  return mostLiked
})

export const genreRouter = router({
  miniature,
  get,
  list,
  mostFav,
})