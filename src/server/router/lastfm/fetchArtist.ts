import { z } from "zod"
import { env } from "../../../env/server.mjs"
import { fetchAndWriteImage } from "../../../utils/writeImage"
import lastfmImageToUrl from "../../../utils/lastfmImageToUrl"
import sanitizeString from "../../../utils/sanitizeString"
import { prisma } from "../../db/client"

const lastFmArtistSchema = z
	.object({
		artist: z.object({
			name: z.string(),
			mbid: z.string().optional(),
			url: z.string(),
			image: z.array(z.object({
				'#text': z.string(),
				size: z.string(),
			})),
			stats: z.object({
				listeners: z.string().transform(Number),
				playcount: z.string().transform(Number),
			}),
			tags: z.object({
				tag: z.array(z.object({
					name: z.string(),
					url: z.string(),
				})),
			}),
		}).optional(),
	})

export default async function fetchArtist(
	artistName: string,
	artistId: string,
	lastfmTrackId?: string,
	lastfmAlbumId?: string,
) {
	const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
	url.searchParams.set('method', 'artist.getInfo')
	url.searchParams.set('format', 'json')
	url.searchParams.set('api_key', env.LAST_FM_API_KEY)
	url.searchParams.set('autocorrect', '1')
	url.searchParams.set('artist', sanitizeString(artistName))
	const data = await fetch(url)
	const json = await data.json()
	const lastfm = lastFmArtistSchema.parse(json)
	if (lastfm.artist && lastfm.artist.url) {
		let coverId
		const image = lastfm.artist.image.at(-1)?.["#text"]
		if (image) {
			const { hash, path, mimetype, palette } = await fetchAndWriteImage(lastfmImageToUrl(image))
			const { id } = await prisma.image.upsert({
				where: { id: hash },
				update: {},
				create: {
					id: hash as string,
					path,
					mimetype,
					palette,
				}
			})
			coverId = id
		}
		const lastfmArtist = await prisma.lastFmArtist.create({
			data: {
				entityId: artistId,
				...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
				...(lastfmAlbumId ? { albums: { connect: { id: lastfmAlbumId } } } : {}),
				url: lastfm.artist.url,
				mbid: lastfm.artist.mbid,
				name: lastfm.artist.name,
				listeners: lastfm.artist.stats.listeners,
				playcount: lastfm.artist.stats.playcount,
				tags: {
					connectOrCreate: lastfm.artist.tags.tag.map(tag => ({
						where: { url: tag.url },
						create: {
							name: tag.name,
							url: tag.url,
						}
					}))
				},
				coverUrl: image,
				coverId,
			}
		})
		if (lastfm.artist.mbid) {
			await prisma.audioDbArtist.updateMany({
				where: { strMusicBrainzID: lastfm.artist.mbid },
				data: { entityId: artistId },
			})
		}
		return lastfmArtist
	}
}