import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"

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
  if (!meta) return null
  const artists = await ctx.prisma.$queryRaw`
    SELECT
      covers.id as "coverId",
      covers.blur as "coverBlur",
      COUNT(*)::int as "tracksCount"
    FROM (
      WITH RECURSIVE sub_rec_genre AS(
        SELECT id, ARRAY[id] as path
          FROM public."Genre"
          WHERE id = ${input.id}
        UNION ALL
        SELECT sub.id, path || sub.id
          FROM sub_rec_genre as sup
        INNER JOIN public."_LinkedGenre" as link
          ON sup.id = link."A"
        INNER JOIN public."Genre" as sub
          ON link."B" = sub.id
        WHERE NOT sub.id = ANY(path)
      )
      SELECT DISTINCT ON(tracks.id)
        tracks."artistId" as id
      FROM sub_rec_genre
      INNER JOIN public."_GenreToTrack" as link
        ON sub_rec_genre.id = link."A"
      INNER JOIN public."Track" as tracks
        ON link."B" = tracks.id
      ORDER BY
        tracks.id
    ) as track_list
    LEFT JOIN public."Artist" as artists
      ON track_list.id = artists.id
    INNER JOIN public."Image" as covers
      ON artists."coverId" = covers.id
    GROUP BY
      covers.id,
      covers.blur
    ORDER BY
      "tracksCount" DESC
    ;
  ` as {
    coverId: string | null
    coverBlur: string | null
    tracksCount: number
  }[]

  const count = artists.reduce((acc, artist) => acc + artist.tracksCount, 0)
  const firstArtistsWithCover: {
    id: string
    blur: string | null | undefined
  }[] = []
  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i]!
    if (artist.coverId) {
      firstArtistsWithCover.push({ id: artist.coverId, blur: artist.coverBlur })
      if (firstArtistsWithCover.length === 3) break
    }
  }

  return {
    ...meta,
    artists: firstArtistsWithCover,
    _count: {
      tracks: count,
    }
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
      // subgenres: {
      //   where: ???,
      //   select: { id: true, name: true },
      // },
      // supgenres: {
      //   where: ???,
      //   select: { id: true, name: true },
      // },
    },
  })
  if (!meta) return null

  const rawTracks = await ctx.prisma.$queryRaw`
    WITH RECURSIVE sub_rec_genre AS(
      SELECT id, ARRAY[id] as path
        FROM public."Genre"
        WHERE id = ${input.id}
      UNION ALL
      SELECT sub.id, path || sub.id
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      INNER JOIN public."Genre" as sub
        ON link."B" = sub.id
      WHERE NOT sub.id = ANY(path)
    )
    SELECT DISTINCT ON(tracks.id)
      tracks.id as id,
      tracks.name as name,
      tracks."artistId" as "artistId",
      tracks."albumId" as "albumId",
      artists.name as "artistName",
      albums.name as "albumName"
    FROM public."Track" as tracks
    INNER JOIN public."_GenreToTrack" as link
      ON tracks.id = link."B"
    INNER JOIN sub_rec_genre
      ON link."A" = sub_rec_genre.id
    LEFT JOIN public."Artist" as artists
      ON tracks."artistId" = artists.id
    LEFT JOIN public."Album" as albums
      ON tracks."albumId" = albums.id
    ;
  ` as {
    id: string
    name: string
    artistId: string | null
    albumId: string | null
    artistName: string | null
    albumName: string | null
  }[]

  const tracks = rawTracks.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artistId
      ? {
        id: track.artistId!,
        name: track.artistName!,
      } : null,
    album: track.albumId
      ? {
        id: track.albumId!,
        name: track.albumName!,
      } : null,
  }))

  return {
    ...meta,
    tracks,
    _count: {
      tracks: tracks.length,
    }
  }
})

const searchable = publicProcedure.query(async ({ ctx }) => {
  return await ctx.prisma.$queryRaw`
    WITH RECURSIVE sub_rec_genre AS (
      SELECT id, id as base_id, name as base_name, ARRAY[id] as path
        FROM public."Genre"
      UNION ALL
      SELECT link."B", sup.base_id, sup.base_name, path || link."B"
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      WHERE NOT link."B" = ANY(path)
    )
    SELECT DISTINCT ON(sub_rec_genre.base_id)
      sub_rec_genre.base_id as id,
      sub_rec_genre.base_name as name
    FROM sub_rec_genre
    WHERE EXISTS (
      SELECT 1
      FROM public."_GenreToTrack" as genreToTrack
      WHERE sub_rec_genre.id = genreToTrack."A"
        OR sub_rec_genre.base_id = genreToTrack."A" -- I don't know if this OR is needed
    )
    ;
  ` as {
    id: string
    name: string
  }[]
})

const mostFav = publicProcedure.query(async ({ ctx }) => {
  const mostLiked = await ctx.prisma.$queryRaw`
    WITH RECURSIVE sub_rec_genre AS (
      SELECT id, 1 as depth, id as base_id, name as base_name, ARRAY[id] as path
        FROM public."Genre"
      UNION ALL
      SELECT sub.id, sup.depth + 1, sup.base_id, sup.base_name, path || sub.id
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      INNER JOIN public."Genre" as sub
        ON link."B" = sub.id
      WHERE NOT sub.id = ANY(path)
    ),
    ordered_sub_rec_genre AS (
      SELECT
        base_id,
        id,
        base_name as name,
        MIN(depth) as min_depth
      FROM sub_rec_genre
      GROUP BY
        base_id,
        id,
        base_name
      ORDER BY
        min_depth ASC
    ),
    liked_tracks AS (
      SELECT
        tracks.id as id,
        genreToTrack."A" as genre_id
      FROM public."UserTrack" as userTracks
      INNER JOIN public."Track" as tracks
        ON tracks.id = userTracks.id
      INNER JOIN public."_GenreToTrack" as genreToTrack
        ON tracks.id = genreToTrack."B"
      WHERE userTracks.favorite = true
    ),
    maxi_list AS (
      SELECT DISTINCT ON (liked_tracks.id, base_id)
        ordered_sub_rec_genre.base_id as base_genre,
        ordered_sub_rec_genre.name as name,
        1 / (min_depth::float ^ 1.6) as score
      FROM ordered_sub_rec_genre
      INNER JOIN liked_tracks
        ON ordered_sub_rec_genre.id = liked_tracks.genre_id
    ),
    scoring_list AS (
      SELECT
        base_genre as id,
        name,
        COUNT(*) as likes, -- how many liked tracks are in this genre (or any of its subgenres)
        SUM(maxi_list.score) as score_sum -- weighted score to avoid "big super-genres" having an unfair advantage
      FROM maxi_list
      GROUP BY
        maxi_list.base_genre,
        maxi_list.name
    ),
    counting_list AS (
      SELECT
        base_id as id,
        COUNT(*) as genre_count
      FROM sub_rec_genre
      GROUP BY
        sub_rec_genre.base_id
    )
    SELECT
      scoring_list.id as id,
      scoring_list.name as name,
      scoring_list.likes as likes,
      -- scoring_list.score_sum as raw_score,
      -- counting_list.genre_count as genre_count,
      scoring_list.score_sum / (counting_list.genre_count::float ^ 1.5) as score
    FROM scoring_list
    INNER JOIN counting_list
      ON scoring_list.id = counting_list.id
    ORDER BY
      score DESC,
      likes DESC
    LIMIT 10
    ;
  ` as {
    id: string
    name: string
    likes: number
    score: number
  }[]

  return mostLiked.map(({ id, name }) => ({ id, name }))
})

export const genreRouter = router({
  miniature,
  get,
  searchable,
  mostFav,
})