import fetchAlbum from "./fetchAlbum"
import { prisma } from "../../db/client"
import { socketServer } from "../../persistent/ws"

/**
 * returns `album.lastfm.id` if found/created, `undefined` if not
 */
export default async function albumMetadata(id: string, lastfmArtistId?: string) {
	const album = await prisma.album.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			artist: { select: { name: true } },
			lastfm: {
				select: {
					id: true,
					artistId: true,
				}
			}
		}
	})

	if (album?.lastfm?.id) {

		if (lastfmArtistId && !album.lastfm.artistId) {
			await prisma.lastFmAlbum.update({
				where: { id: album.lastfm.id },
				data: {
					artist: { connect: { id: lastfmArtistId } }
				},
			})
			socketServer.send("invalidate:album", { id })
		}

		return album.lastfm.id
	}

	if (album?.artist) {
		const lastfmAlbum = await fetchAlbum(
			album.id,
			album.artist.name,
			album.name,
			lastfmArtistId,
		)
		if (lastfmAlbum) {
			socketServer.send("invalidate:album", { id })
			return lastfmAlbum.id
		}
	}
}