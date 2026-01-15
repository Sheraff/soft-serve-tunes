import { prisma } from "server/db/client"
import { Prisma } from "@prisma/client"

export type TrackMiniature = {
	file: {
		container: string
	} | null
	artist: {
		id: string
		name: string
	} | null
	album: {
		id: string
		name: string
	} | null
	cover: {
		id: string
		palette: Prisma.JsonValue
	} | null
	feats: {
		id: string
		name: string
	}[]
	spotify: {
		explicit: boolean | null
	} | null
	userData: {
		favorite: boolean
	} | null
	id: string
	createdAt: Date
	name: string
	position: number | null
} | null

export function getTrackMiniature(id: string) {
	return prisma.$queryRaw<[TrackMiniature]>`
	WITH track AS (
		SELECT
			track.id,
			track.name,
			track. "createdAt" AS createdAt,
			track.position,
			userData.favorite,
			CASE WHEN album.id IS NULL THEN
				NULL
			ELSE
				json_build_object('name',
					album.name,
					'id',
					album.id)
			END AS album,
			CASE WHEN artist.id IS NULL THEN
				NULL
			ELSE
				json_build_object('name',
					artist.name,
					'id',
					artist.id)
			END AS artist,
			CASE WHEN cover.id IS NULL THEN
				NULL
			ELSE
				json_build_object('palette',
					cover.palette,
					'id',
					cover.id)
			END AS cover,
			CASE WHEN spotify.id IS NULL THEN
				NULL
			ELSE
				json_build_object('explicit',
					spotify.explicit)
			END AS spotify,
			CASE WHEN file.id IS NULL THEN
				NULL
			ELSE
				json_build_object('container',
					file.container)
			END AS file
		FROM
			public. "Track" track
		LEFT JOIN public. "UserTrack" userData ON track.id = userData.id
		LEFT JOIN public. "Album" album ON track. "albumId" = album.id
		LEFT JOIN public. "Artist" artist ON track. "artistId" = artist.id
		LEFT JOIN public. "Image" cover ON track. "coverId" = cover.id
		LEFT JOIN public. "SpotifyTrack" spotify ON track.id = spotify. "trackId"
		LEFT JOIN public. "File" file ON track.id = file. "trackId"
		WHERE track.id = ${id}
	),
	feats AS (
		SELECT
			track.id,
			COALESCE(json_agg(json_build_object('name',
						feats. "name",
						'id',
						feats.id)) FILTER (WHERE feats.id IS NOT NULL),
				'[]') AS feats
		FROM track
		LEFT JOIN public. "_Featuring" track_feats ON track.id = track_feats. "B"
		LEFT JOIN public. "Artist" feats ON track_feats. "A" = feats.id
		GROUP BY track.id
	)
	SELECT
		track.id,
		track.name,
		track.createdAt,
		track.position,
		track.favorite,
		track.album,
		track.artist,
		track.cover,
		track.spotify,
		track.file,
		feats.feats
	FROM track
	LEFT JOIN feats ON track.id = feats.id;
`}