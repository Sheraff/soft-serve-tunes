import { prisma } from "server/db/client"
import { Prisma } from "@prisma/client"

type Traits =
	| "danceability"
	| "energy"
	| "speechiness"
	| "acousticness"
	| "instrumentalness"
	| "liveness"
	| "valence"

export type TrackByMultiTraits = {
	id: string,
	name: string
	artist: {
		id: string,
		name: string
	},
	album: {
		id: string,
		name: string
	},
	score: number
}

export function getTracksByMultiTraits(
	traits: Record<Traits, number | undefined>,
	count: number,
	excludeIds: string[] = [],
) {
	return prisma.$queryRaw<TrackByMultiTraits[]>`
	WITH spotify_list AS (
		SELECT
			public."SpotifyTrack"."trackId" as id,
			(0
				- (CASE WHEN ${traits.danceability ?? -1} = -1 THEN 0 ELSE ABS(${traits.danceability} - public."SpotifyTrack"."danceability") END)
				- (CASE WHEN ${traits.energy ?? -1} = -1 THEN 0 ELSE ABS(${traits.energy} - public."SpotifyTrack"."energy") END)
				- (CASE WHEN ${traits.speechiness ?? -1} = -1 THEN 0 ELSE ABS(${traits.speechiness} - public."SpotifyTrack"."speechiness") END)
				- (CASE WHEN ${traits.acousticness ?? -1} = -1 THEN 0 ELSE ABS(${traits.acousticness} - public."SpotifyTrack"."acousticness") END)
				- (CASE WHEN ${traits.instrumentalness ?? -1} = -1 THEN 0 ELSE ABS(${traits.instrumentalness} - public."SpotifyTrack"."instrumentalness") END)
				- (CASE WHEN ${traits.liveness ?? -1} = -1 THEN 0 ELSE ABS(${traits.liveness} - public."SpotifyTrack"."liveness") END)
				- (CASE WHEN ${traits.valence ?? -1} = -1 THEN 0 ELSE ABS(${traits.valence} - public."SpotifyTrack"."valence") END)
			)::float as score
		FROM public."SpotifyTrack"
		WHERE (
			public."SpotifyTrack"."durationMs" > 30000
			AND (CASE WHEN ${traits.danceability ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."danceability" IS NOT NULL
				AND public."SpotifyTrack"."danceability" <> 0
				AND ABS(${traits.danceability} - public."SpotifyTrack"."danceability") < 0.5
			END)
			AND (CASE WHEN ${traits.energy ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."energy" IS NOT NULL
				AND public."SpotifyTrack"."energy" <> 0
				AND ABS(${traits.energy} - public."SpotifyTrack"."energy") < 0.5
			END)
			AND (CASE WHEN ${traits.speechiness ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."speechiness" IS NOT NULL
				AND public."SpotifyTrack"."speechiness" <> 0
				AND ABS(${traits.speechiness} - public."SpotifyTrack"."speechiness") < 0.5
			END)
			AND (CASE WHEN ${traits.acousticness ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."acousticness" IS NOT NULL
				AND public."SpotifyTrack"."acousticness" <> 0
				AND ABS(${traits.acousticness} - public."SpotifyTrack"."acousticness") < 0.5
			END)
			AND (CASE WHEN ${traits.instrumentalness ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."instrumentalness" IS NOT NULL
				AND public."SpotifyTrack"."instrumentalness" <> 0
				AND ABS(${traits.instrumentalness} - public."SpotifyTrack"."instrumentalness") < 0.5
			END)
			AND (CASE WHEN ${traits.liveness ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."liveness" IS NOT NULL
				AND public."SpotifyTrack"."liveness" <> 0
				AND ABS(${traits.liveness} - public."SpotifyTrack"."liveness") < 0.5
			END)
			AND (CASE WHEN ${traits.valence ?? -1} = -1 THEN TRUE ELSE
				public."SpotifyTrack"."valence" IS NOT NULL
				AND public."SpotifyTrack"."valence" <> 0
				AND ABS(${traits.valence} - public."SpotifyTrack"."valence") < 0.5
			END)
		)
	)
	SELECT
		tracks.id as id,
		tracks.name as name,
		spotify_list.score as score,
		CASE WHEN album.id IS NULL
			THEN NULL
			ELSE json_build_object('name', album.name, 'id', album.id)
		END AS album,
		CASE WHEN artist.id IS NULL
			THEN NULL
			ELSE json_build_object('name', artist.name, 'id', artist.id)
		END AS artist
	FROM public."Track" tracks
	INNER JOIN spotify_list ON spotify_list.id = tracks.id
	LEFT JOIN public."Artist" artist ON artist.id = tracks."artistId"
	LEFT JOIN public."Album" album ON album.id = tracks."albumId"
	WHERE tracks.id NOT IN (${Prisma.join(excludeIds)})
	ORDER BY score DESC
	LIMIT ${count};
`}