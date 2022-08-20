import fetchTrack from "./fetchTrack"
import { prisma } from "../../db/client"
import { socketServer } from "../../persistent/ws"
import artistMetadata from "./artistMetadata"
import albumMetadata from "./albumMetadata"

export default async function trackMetadata(id: string) {
	const track = await prisma.track.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			lastfm: {
				include: {
					artist: { select: { id: true } },
					album: { select: { id: true } },
				}
			},
			artist: {
				select: {
					id: true,
					name: true,
					lastfm: { select: { id: true } }
				},
			},
			album: {
				select: {
					id: true,
					name: true,
					lastfm: { select: { id: true } }
				}
			}
		}
	})
	if (!track) {
		throw new Error("Track not found")
	}
	if (!track.artist) {
		throw new Error("Track has no artist, not enough to get last.fm info")
	}

	let lastfmAlbumId = track.album?.lastfm?.id
	let lastfmArtistId = track.artist.lastfm?.id

	if (!track.artist.lastfm) {
		const result = await artistMetadata(track.artist.id)
		if (result) {
			lastfmArtistId = result
		}
	}
	
	if (track.album && !track.album.lastfm) {
		const result = await albumMetadata(track.album.id)
		if (result) {
			lastfmAlbumId = result
		}
	}

	if (!track.lastfm) {
		const lastfmTrack = await fetchTrack(
			track.id,
			track.name,
			track.artist.name,
			lastfmAlbumId,
			lastfmArtistId
		)
		if (lastfmTrack) {
			socketServer.send("invalidate:track", { id })
		}
	} else {
		let invalidate = false
		if (lastfmArtistId && track.lastfm.artist && !track.lastfm.artist.id) {
			await prisma.lastFmTrack.update({
				where: { id: track.lastfm.id },
				data: {
					artist: { connect: { id: lastfmArtistId } }
				},
			})
			socketServer.send("invalidate:artist", { id })
			invalidate = true
		}
		if (lastfmAlbumId && track.lastfm.album && !track.lastfm.album.id) {
			await prisma.lastFmTrack.update({
				where: { id: track.lastfm.id },
				data: {
					album: { connect: { id: lastfmAlbumId } }
				},
			})
			socketServer.send("invalidate:album", { id })
			invalidate = true
		}

		if (invalidate) {
			socketServer.send("invalidate:track", { id })
		}
	}
}