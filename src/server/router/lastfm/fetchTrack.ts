import { z } from "zod"
import { env } from "../../../env/server.mjs"
import { fetchAndWriteImage } from "../../../utils/writeImage"
import lastfmImageToUrl from "../../../utils/lastfmImageToUrl"
import sanitizeString from "../../../utils/sanitizeString"
import { prisma } from "../../db/client"

const lastFmTrackSchema = z
	.object({
		track: z.object({
			album: z.object({
				'@attr': z.object({
					position: z.string(),
				}).optional(),
				title: z.string(),
				mbid: z.string().optional(),
				artist: z.string(),
				image: z.array(z.object({
					'#text': z.string(),
					size: z.string(),
				})),
				url: z.string(),
			}).optional(),
			artist: z.object({
				name: z.string(),
				mbid: z.string().optional(),
				url: z.string(),
			}),
			toptags: z.object({
				tag: z.array(z.object({
					name: z.string(),
					url: z.string(),
				})),
			}),
			streamable: z.object({
				'#text': z.string(),
				fulltrack: z.string(),
			}),
			duration: z.string().transform(Number),
			listeners: z.string().transform(Number),
			mbid: z.string().optional(),
			name: z.string(),
			playcount: z.string().transform(Number),
			url: z.string(),
		}).optional(),
	})

export default async function fetchTrack(
	trackId: string,
	trackName: string,
	artistName: string,
	lastfmAlbumId?: string,
	lastfmArtistId?: string,
) {
	const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
	url.searchParams.set('method', 'track.getInfo')
	url.searchParams.set('format', 'json')
	url.searchParams.set('api_key', env.LAST_FM_API_KEY)
	url.searchParams.set('track', sanitizeString(trackName))
	url.searchParams.set('autocorrect', '1')
	url.searchParams.set('artist', sanitizeString(artistName))
	const data = await fetch(url)
	const json = await data.json()
	const lastfm = lastFmTrackSchema.parse(json)
	if (lastfm.track && lastfm.track.url) {
		const lastfmTrack = await prisma.lastFmTrack.create({
			data: {
				entityId: trackId,
				...(lastfmAlbumId ? { albumId: lastfmAlbumId } : {}),
				...(lastfmArtistId ? { artistId: lastfmArtistId } : {}),
				url: lastfm.track.url,
				duration: lastfm.track.duration,
				listeners: lastfm.track.listeners,
				playcount: lastfm.track.playcount,
				mbid: lastfm.track.mbid,
				name: lastfm.track.name,
				tags: {
					connectOrCreate: lastfm.track.toptags.tag
						.filter(tag => tag.url)
						.map(tag => ({
							where: { url: tag.url },
							create: {
								name: tag.name,
								url: tag.url,
							}
						}))
				},
			}
		})
		if (lastfm.track.mbid) {
			await prisma.audioDbTrack.updateMany({
				where: { strMusicBrainzID: lastfm.track.mbid },
				data: { entityId: trackId },
			})
		}
		return lastfmTrack
	}
}