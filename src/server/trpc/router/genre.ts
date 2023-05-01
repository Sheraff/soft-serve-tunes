import { router, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { type Prisma } from "@prisma/client"

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
      artists."coverId" as "coverId",
      COUNT(*)::int as "tracksCount"
    FROM (
      WITH RECURSIVE sub_rec_genre AS(
        SELECT * FROM public."Genre"
          WHERE id = ${input.id}
        UNION ALL
        SELECT sub.*
          FROM sub_rec_genre as sup
        INNER JOIN public."_LinkedGenre" as link
          ON sup.id = link."A"
        INNER JOIN public."Genre" as sub
          ON link."B" = sub.id
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
    INNER JOIN public."Artist" as artists
      ON track_list.id = artists.id
    GROUP BY
      artists."coverId"
    ORDER BY
      "tracksCount" DESC
    ;
  ` as {
    coverId: string
    tracksCount: number
  }[]

  const count = artists.reduce((acc, artist) => acc + artist.tracksCount, 0)

  return {
    ...meta,
    artists: artists.slice(0, 3),
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
      SELECT * FROM public."Genre"
        WHERE id = ${input.id}
      UNION ALL
      SELECT sub.*
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      INNER JOIN public."Genre" as sub
        ON link."B" = sub.id
    )
    SELECT DISTINCT ON(tracks.id)
      tracks.id as id,
      tracks.name as name,
      tracks."artistId" as "artistId",
      tracks."albumId" as "albumId",
      artists.name as "artistName",
      albums.name as "albumName"
    FROM sub_rec_genre
    INNER JOIN public."_GenreToTrack" as link
      ON sub_rec_genre.id = link."A"
    INNER JOIN public."Track" as tracks
      ON link."B" = tracks.id
    INNER JOIN public."Artist" as artists
      ON tracks."artistId" = artists.id
    INNER JOIN public."Album" as albums
      ON tracks."albumId" = albums.id
    ORDER BY
      tracks.id
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
      SELECT *, id as base_id, name as base_name FROM public."Genre"
        WHERE id = public."Genre".id
      UNION ALL
      SELECT sub.*, sup.base_id, sup.base_name
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      INNER JOIN public."Genre" as sub
        ON link."B" = sub.id
    )
    SELECT DISTINCT
      sub_rec_genre.base_id as id,
      sub_rec_genre.base_name as name
    FROM sub_rec_genre
    INNER JOIN public."_GenreToTrack" as genreToTrack
      ON sub_rec_genre.id = genreToTrack."A"
    INNER JOIN public."Track"
      ON genreToTrack."B" = public."Track".id
    ORDER BY
      name ASC
    ;
  ` as {
    id: string
    name: string
  }[]
})

const mostFav = publicProcedure.query(async ({ ctx }) => {
  const mostLiked = await ctx.prisma.$queryRaw`
    WITH RECURSIVE sub_rec_genre AS (
      SELECT *, 0 as depth, id as base_id, name as base_name FROM public."Genre"
        WHERE id = public."Genre".id
      UNION ALL
      SELECT sub.*, sup.depth + 1, sup.base_id, sup.base_name
        FROM sub_rec_genre as sup
      INNER JOIN public."_LinkedGenre" as link
        ON sup.id = link."A"
      INNER JOIN public."Genre" as sub
        ON link."B" = sub.id
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
        public."Track".id as id,
        genreToTrack."A" as genre_id
      FROM public."Track"
      INNER JOIN public."UserTrack" as userTracks
        ON public."Track".id = userTracks.id
      INNER JOIN public."_GenreToTrack" as genreToTrack
        ON public."Track".id = genreToTrack."B"
      WHERE userTracks.favorite = true
    ),
    maxi_list AS (
      SELECT DISTINCT ON (liked_tracks.id, base_id)
        ordered_sub_rec_genre.base_id as base_genre,
        ordered_sub_rec_genre.name as name,
        1 / (POWER(min_depth::float, 2) + 1) as score
      FROM ordered_sub_rec_genre
      INNER JOIN liked_tracks
        ON ordered_sub_rec_genre.id = liked_tracks.genre_id
    )
    SELECT
      base_genre as id,
      name,
      COUNT(*) as likes, -- how many liked tracks are in this genre (or any of its subgenres)
      SUM(maxi_list.score) / COUNT(*)::float as score -- weighted score to avoid "big super-genres" having an unfair advantage (used to be COUNT(*)::float ** 2)
    FROM maxi_list
    GROUP BY
      maxi_list.base_genre,
      maxi_list.name
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