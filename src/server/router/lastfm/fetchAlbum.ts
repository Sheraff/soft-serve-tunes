import { z } from "zod"
import { env } from "../../../env/server.mjs"
import { fetchAndWriteImage } from "../../../utils/writeImage"
import lastfmImageToUrl from "../../../utils/lastfmImageToUrl"
import sanitizeString from "../../../utils/sanitizeString"
import { prisma } from "../../db/client"

const lastFmAlbumSchema = z
	.object({
		album: z.object({
			name: z.string(),
			artist: z.string(),
			id: z.string().optional(),
			mbid: z.string().optional(),
			url: z.string(),
			releasedate: z.string().optional().transform(Date),
			image: z.array(z.object({
				'#text': z.string(),
				size: z.string(),
			})),
			listeners: z.string().transform(Number),
			playcount: z.string().transform(Number),
			toptags: z.object({
				tag: z.array(z.object({
					name: z.string(),
					url: z.string(),
				})),
			}).optional(),
			tracks: z.object({
				track: z.union([
					z.array(z.object({
						name: z.string(),
						url: z.string(),
					})),
					z.object({})
				]),
			}).optional(),
		}).optional(),
	})

export default async function fetchAlbum(
	albumId: string,
	artistName: string,
	albumName: string,
	lastfmArtistId?: string,
	lastfmTrackId?: string,
) {
	const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
	url.searchParams.set('method', 'album.getInfo')
	url.searchParams.set('format', 'json')
	url.searchParams.set('api_key', env.LAST_FM_API_KEY)
	url.searchParams.set('autocorrect', '1')
	url.searchParams.set('artist', sanitizeString(artistName))
	url.searchParams.set('album', sanitizeString(albumName))
	const data = await fetch(url)
	const json = await data.json()
	const lastfm = lastFmAlbumSchema.parse(json)
	if (lastfm.album && lastfm.album.url) {
		let coverId
		const image = lastfm.album.image.at(-1)?.["#text"]
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
		const lastfmAlbum = await prisma.lastFmAlbum.create({
			data: {
				entityId: albumId,
				...(lastfmArtistId ? { artistId: lastfmArtistId } : {}),
				...(lastfmTrackId ? { tracks: { connect: { id: lastfmTrackId } } } : {}),
				url: lastfm.album.url,
				mbid: lastfm.album.mbid,
				name: lastfm.album.name,
				listeners: lastfm.album.listeners,
				playcount: lastfm.album.playcount,
				...(lastfm.album.toptags?.tag.length ? {
					tags: {
						connectOrCreate: lastfm.album.toptags.tag.map(tag => ({
							where: { url: tag.url },
							create: {
								name: tag.name,
								url: tag.url,
							}
						}))
					}
				} : {}),
				coverUrl: image,
				coverId,
			},
		})
		if (lastfm.album.mbid) {
			await prisma.audioDbAlbum.updateMany({
				where: { strMusicBrainzID: lastfm.album.mbid },
				data: { entityId: albumId },
			})
		}
		return lastfmAlbum
	}
}