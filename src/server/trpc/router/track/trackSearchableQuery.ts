import { prisma } from "server/db/client"

export type TrackSearchable = {
	artist: {
		name: string
	} | null
	album: {
		name: string
	} | null
	id: string
	name: string
}

export function getTrackSearchable() {
	return prisma.$queryRaw<TrackSearchable[]>`
	SELECT
		track.id,
		track.name,
		json_build_object('name', artist. "name") AS artist,
		json_build_object('name', album. "name") AS album
	FROM
		public."Track" track
		INNER JOIN public."Artist" artist ON track. "artistId" = artist.id
		INNER JOIN public."Album" album ON track. "albumId" = album.id;
	`
}