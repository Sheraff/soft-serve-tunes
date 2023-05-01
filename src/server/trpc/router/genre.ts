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

/*

==== SINGLE QUERY TO GET ALL SUBGENRES ====

WITH RECURSIVE sub_rec_genre AS(
  SELECT *, 0 as depth FROM "public"."Genre"
    WHERE id = 'clb2rxfiy0018y48uiibdisk0'
  UNION ALL
  SELECT sub.*, sup.depth + 1
    FROM sub_rec_genre as sup
  INNER JOIN "public"."_LinkedGenre" as foo
    ON sup.id = foo."A"
  INNER JOIN "public"."Genre" as sub
    ON foo."B" = sub.id
)
SELECT * FROM sub_rec_genre;



==== SINGLE QUERY TO GET ALL TRACKS FROM GENRE LIST ====
SELECT * FROM "public"."Genre" as genres
INNER JOIN "public"."_GenreToTrack" as foo
  ON genres.id = foo."A"
INNER JOIN "public"."Track" as tracks
  ON foo."B" = tracks.id
WHERE genres.id = 'clb2rxfiy0018y48uiibdisk0' OR genres.id = 'clb2s002l02a2y48uxvfbl1tx';


==== COMBINE BOTH ====

WITH RECURSIVE sub_rec_genre AS(
  SELECT *, 0 as depth FROM "public"."Genre"
    WHERE id = 'clb2rxfiy0018y48uiibdisk0'
  UNION ALL
  SELECT sub.*, sup.depth + 1
    FROM sub_rec_genre as sup
  INNER JOIN "public"."_LinkedGenre" as foo
    ON sup.id = foo."A"
  INNER JOIN "public"."Genre" as sub
    ON foo."B" = sub.id
)
SELECT * FROM sub_rec_genre
INNER JOIN "public"."_GenreToTrack" as foo
  ON sub_rec_genre.id = foo."A"
INNER JOIN "public"."Track" as tracks
  ON foo."B" = tracks.id
;


==== DISTINCT TRACKS (& GENRE ?) (prefer minimum depth) ====

WITH RECURSIVE sub_rec_genre AS(
  SELECT *, 0 as depth FROM "public"."Genre"
    WHERE id = 'clb2rxfiy0018y48uiibdisk0'
  UNION ALL
  SELECT sub.*, sup.depth + 1
    FROM sub_rec_genre as sup
  INNER JOIN (SELECT "A" as supId, "B" as subId FROM "public"."_LinkedGenre") as foo
    ON sup.id = foo.supId
  INNER JOIN "public"."Genre" as sub
    ON foo.subId = sub.id
)
SELECT DISTINCT ON(trackId) * FROM sub_rec_genre
INNER JOIN (
    SELECT "A" as genreId, "B" as trackId
    FROM "public"."_GenreToTrack"
  ) as foo
  ON sub_rec_genre.id = foo.genreId
INNER JOIN "public"."Track" as tracks
  ON foo.trackId = tracks.id
ORDER BY
  trackId,
  sub_rec_genre.depth,
  sub_rec_genre.id
;


*/

export async function recursiveSubGenres<
  TrackArgs extends Prisma.TrackFindManyArgs & { select: { id: true } } = { select: { id: true } },
> (
  ids: string[],
  args?: TrackArgs,
  callback?: (track: Prisma.TrackGetPayload<TrackArgs>, depth: number) => void,
  tracks: Prisma.TrackGetPayload<TrackArgs>[] = [],
  genreSet?: Set<string>,
  trackSet: Set<string> = new Set(),
  depth = 0
) {
  if (!genreSet) {
    genreSet = new Set(ids)
  }
  const tracksArg = args || { select: { id: true } }
  // TODO: we might want to also select album>tracks in addition to tracks,
  // musicbrainz reports having a lot of genre connections on albums (49% of albums have at least 1 genre),
  // but don't report anything on tracks
  const data = await prisma.genre.findMany({
    where: { id: { in: ids } },
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
  }) as unknown as {
    tracks: Prisma.TrackGetPayload<TrackArgs>[]
    audiodbTracks: { entity: Prisma.TrackGetPayload<TrackArgs> | null }[]
    subgenres: { id: string }[]
  }[] // TS needs a little help here since it kept crashing or thinking `data` was Genre or even any.

  const subgenres: string[] = []
  for (let i = 0; i < data.length; i++) {
    const genre = data[i]!
    for (let j = 0; j < genre.subgenres.length; j++) {
      const subgenre = genre.subgenres[j]!
      if (!genreSet.has(subgenre.id)) {
        genreSet.add(subgenre.id)
        subgenres.push(subgenre.id)
      }
    }
    for (let j = 0; j < genre.tracks.length; j++) {
      const track = genre.tracks[j]!
      if (!trackSet.has(track.id)) {
        tracks.push(track)
        trackSet.add(track.id)
        if (callback) {
          callback(track, depth)
        }
      }
    }
    for (let j = 0; j < genre.audiodbTracks.length; j++) {
      const track = genre.audiodbTracks[j]!.entity
      if (track && !trackSet.has(track.id)) {
        tracks.push(track)
        trackSet.add(track.id)
        if (callback) {
          callback(track, depth)
        }
      }
    }
  }
  if (subgenres.length) {
    await recursiveSubGenres(subgenres, args, callback, tracks, genreSet, trackSet, depth + 1)
  }
  return { tracks, genreSet }
}

function extendFromRecursive<
  Meta extends object,
  Data extends {
    tracks: unknown[]
    genreSet: Set<string>
  },
  Keep extends boolean
> (
  meta: Meta,
  data: Data,
  keepTracks: Keep
): Meta & {
  _count: { tracks: number, from: number }
  tracks: Keep extends true ? Data["tracks"] : never
} {
  if (keepTracks) {
    return {
      ...meta,
      tracks: data.tracks,
      _count: {
        tracks: data.tracks.length,
        from: data.genreSet.size,
      }
    } as Meta & {
      _count: { tracks: number, from: number }
      tracks: Keep extends true ? Data["tracks"] : never
    }
  } else {
    return {
      ...meta,
      _count: {
        tracks: data.tracks.length,
        from: data.genreSet.size,
      }
    } as Meta & {
      _count: { tracks: number, from: number }
      tracks: Keep extends true ? Data["tracks"] : never
    }
  }
}

async function recursiveNonEmpty (ids: string[], genreSet?: Set<string>): Promise<boolean> {
  if (!genreSet) {
    genreSet = new Set(ids)
  }
  const data = await prisma.genre.findMany({
    where: { id: { in: ids } },
    select: {
      tracks: { take: 1, select: { id: true } },
      subgenres: {
        select: { id: true },
        where: nonEmptyGenreWhere,
      },
    }
  })
  if (!data.length) return false
  if (data.some(genre => genre.tracks.length)) return true

  const nextIds: string[] = []
  for (const genre of data) {
    for (const sub of genre.subgenres) {
      if (!genreSet.has(sub.id)) {
        genreSet.add(sub.id)
        nextIds.push(sub.id)
      }
    }
  }
  if (!nextIds.length) return false

  return recursiveNonEmpty(nextIds, genreSet)
}

const miniatureTest = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const data = await ctx.prisma.$queryRaw`
    WITH RECURSIVE sub_rec_genre AS(
      SELECT *, 0 as depth FROM "public"."Genre"
        WHERE id = ${input.id}
      UNION ALL
      SELECT sub.*, sup.depth + 1
        FROM sub_rec_genre as sup
      INNER JOIN (
          SELECT "A" as supId, "B" as subId
          FROM "public"."_LinkedGenre"
        ) as foo
        ON sup.id = foo.supId
      INNER JOIN "public"."Genre" as sub
        ON foo.subId = sub.id
    )
    SELECT DISTINCT ON(trackId) * FROM sub_rec_genre
    INNER JOIN (
        SELECT "A" as genreId, "B" as trackId
        FROM "public"."_GenreToTrack"
      ) as foo
      ON sub_rec_genre.id = foo.genreId
    INNER JOIN "public"."Track" as tracks
      ON foo.trackId = tracks.id
    ORDER BY
      trackId,
      sub_rec_genre.depth,
      sub_rec_genre.id
    ;
  `
  /*
  gives an array like below
  need to rename some columns:
   - id should be that of track,
   - name should be that of track

  to use in "GenreList", we should have a separate query for the data of the genre itself

  {
    "id": "clb2rxt3g008yy48umcm4acbj",
    "name": "If It Hadn't Been for Love",
    "simplified": "ifithadn'tbeenforlove",
    "depth": 0,
    "genreid": "clb2rxt3j009vy48udtg6b4yz",
    "trackid": "clb2rxt3g008yy48umcm4acbj",
    "mbid": "4f5c4119-7b91-4bb4-b45e-febc22838818",
    "artistId": "clb2rxfgf0003y48u2e0aa9ag",
    "albumId": "clb2rxfiy0017y48u6veat1bz",
    "position": 6,
    "createdAt": "2022-11-29T22:11:51.052Z",
    "year": null,
    "metaImageId": null,
    "lastfmDate": "2023-04-25T20:47:07.739Z",
    "spotifyDate": "2023-04-25T20:47:05.253Z",
    "audiodbDate": "2022-12-03T17:50:27.389Z",
    "coverId": "8d59d80b1f0c7c8b9c91e9053971db98",
    "coverLocked": false,
    "metaPosition": null
  }
  */
  return data
})

const miniature = publicProcedure.input(z.object({
  id: z.string(),
})).query(async ({ input, ctx }) => {
  const meta = await ctx.prisma.genre.findUnique({
    where: { id: input.id },
    select: {
      name: true,
      id: true,
    }
  })
  if (!meta) return meta
  const data = await recursiveSubGenres([input.id], { select: { id: true, artistId: true } })

  const artistCountMap = data.tracks.reduce((map, track) => {
    if (track.artistId)
      map.set(track.artistId, (map.get(track.artistId) || 0) + 1)
    return map
  }, new Map<string, number>())
  const threeTopArtists = [...artistCountMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  const artists = await ctx.prisma.artist.findMany({
    where: { id: { in: threeTopArtists } },
    select: { coverId: true },
    distinct: ["coverId"]
  })

  const extended = extendFromRecursive(meta, data, false)
  return {
    ...extended,
    artists,
  }
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
  const data = await recursiveSubGenres([input.id], {
    select: {
      id: true,
      name: true,
      artist: {
        select: {
          id: true,
          name: true,
        },
      },
      album: {
        select: {
          id: true,
          name: true,
        },
      }
    }
  })
  return extendFromRecursive(meta, data, true)

  // const fullMeta = {
  //   ...meta,
  //   supgenres: await Promise.all(meta.supgenres.map(async (genre) => {
  //     const data = await recursiveSubGenres([genre.id])
  //     return extendFromRecursive(genre, data, false)
  //   })),
  //   subgenres: await Promise.all(meta.subgenres.map(async (genre) => {
  //     const data = await recursiveSubGenres([genre.id])
  //     return extendFromRecursive(genre, data, false)
  //   })),
  // }
  // const result = extendFromRecursive(fullMeta, data, true)
  // return result
})

const searchable = publicProcedure.query(async ({ ctx }) => {
  const seed = await ctx.prisma.genre.findMany({
    where: nonEmptyGenreWhere,
    orderBy: { name: "asc" },
    select: {
      name: true,
      id: true,
      tracks: { take: 1, select: { id: true } },
    }
  })
  const keep: Array<{ id: string, name: string }> = []
  for (const genre of seed) {
    if (genre.tracks.length || await recursiveNonEmpty([genre.id]))
      keep.push({ name: genre.name, id: genre.id })
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
    const data = await recursiveSubGenres(
      [genre.id],
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
      score: genreFavScore / (data.genreSet.size ** 2),
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
  searchable,
  mostFav,
  miniatureTest,
})