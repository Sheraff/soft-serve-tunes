import fetchArtist from "./fetchArtist"
import { prisma } from "../../db/client"
import { socketServer } from "../../persistent/ws"

/**
 * returns `artist.lastfm.id` if found/created, `undefined` if not
 */
export default async function artistMetadata(id: string) {
	const artist = await prisma.artist.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			lastfm: {
				select: {
					id: true,
				}
			}
		}
	})

	if (artist?.lastfm?.id) {
		return artist.lastfm.id
	}

	if (artist) {
		const lastfmArtist = await fetchArtist(
			artist.name,
			artist.id,
		)
		if (lastfmArtist) {
			socketServer.send("invalidate:artist", { id })
			return lastfmArtist.id
		}
	}
}