import { env } from "../../env/server.mjs"
import { z } from "zod"
import Queue from "../../utils/Queue"
import { prisma } from "../db/client"
import { fetchAndWriteImage } from "../../utils/writeImage"
import sanitizeString from "../../utils/sanitizeString"
import { socketServer } from "./ws"
import lastfmImageToUrl from "../../utils/lastfmImageToUrl"

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

type WaitlistEntry = (() => Promise<void>)

class LastFM {
	static RATE_LIMIT = 100
	static STORAGE_LIMIT = 50

	#queue: Queue
	#waitlist: WaitlistEntry[] = []

	constructor() {
		this.#queue = new Queue(LastFM.RATE_LIMIT)
	}

	async #processWaitlist() {
		if (this.#waitlist.length === 1) {
			while (this.#waitlist.length) {
				try {
					await this.#waitlist.shift()?.()
				} catch (e) {
					// catching, just in case, so that 1 item in the waiting list doesn't ruin the entire list
					console.error(e)
				}
			}
		}
	}

	async findTrack(id: string) {
		const promise = new Promise<boolean>(resolve => this.#waitlist.push(() => this.#findTrack(id).then(resolve)))
		this.#processWaitlist()
		return promise
	}
	async findArtist(id: string) {
		const promise = new Promise<boolean>(resolve => this.#waitlist.push(() => this.#findArtist(id).then(resolve)))
		this.#processWaitlist()
		return promise
	}
	async findAlbum(id: string) {
		const promise = new Promise<boolean>(resolve => this.#waitlist.push(() => this.#findAlbum(id).then(resolve)))
		this.#processWaitlist()
		return promise
	}

	async #findTrack(id: string) {
		const track = await prisma.track.findUnique({
			where: { id },
			select: {
				name: true,
				lastfm: { select: { id: true } },
				audiodb: { select: { strMusicBrainzID: true } },
				artist: {
					select: {
						id: true,
						name: true,
						lastfm: { select: { id: true } },
					}
				},
				album: {
					select: {
						id: true,
						name: true,
						lastfm: { select: { id: true } },
						artist: { select: { id: true, name: true } },
					}
				},
			}
		})
		if (!track) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm failed to find track ${id} in prisma.track`)
			return false
		}
		if (track.lastfm) {
			return false
		}
		const urls: URL[] = []
		if (track.audiodb?.strMusicBrainzID) {
			urls.push(makeTrackUrl({ mbid: track.audiodb.strMusicBrainzID }))
		}
		if (track.artist) {
			urls.push(makeTrackUrl({ artist: track.artist.name, track: track.name }))
		}
		if (track.album?.artist?.name) {
			urls.push(makeTrackUrl({ artist: track.album.artist.name, track: track.name }))
		}
		if (urls.length === 0) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm not enough info to look up track ${track.name}`)
			return false
		}
		let trackData
		for (const url of urls) {
			await this.#queue.next()
			const data = await fetch(url)
			const json = await data.json()
			const lastfm = lastFmTrackSchema.parse(json)
			if (lastfm.track && lastfm.track.url) {
				// no `url` field is usually a sign of poor quality data
				trackData = lastfm.track
				break
			}
		}
		if (!trackData) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm no result for ${track.name} w/ ${urls.length} tries`)
			return false
		}

		const connectingArtist = track.artist?.lastfm?.id || await findConnectingArtistForTrack(trackData)
		const connectingAlbum = track.album?.lastfm?.id || await findConnectingAlbumForTrack(trackData)
		const lastfmTrack = await prisma.lastFmTrack.create({
			data: {
				entityId: id,
				...(connectingAlbum ? { albumId: connectingAlbum } : {}),
				...(connectingArtist ? { artistId: connectingArtist } : {}),
				url: trackData.url,
				duration: trackData.duration,
				listeners: trackData.listeners,
				playcount: trackData.playcount,
				mbid: trackData.mbid,
				name: trackData.name,
				tags: {
					connectOrCreate: trackData.toptags.tag
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
		if (trackData.mbid) {
			// TODO: shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			await prisma.audioDbTrack.updateMany({
				where: { strMusicBrainzID: trackData.mbid },
				data: { entityId: id },
			})
		}
		const artist = track.artist
		if (!connectingArtist && artist) {
			try {
				await new Promise<void>(resolve => this.#findArtist(artist.id).finally(resolve))
			} catch (e) {
				// catching so that a track can still send its invalidation signal if the artist fails
				console.error(e)
			}
		}
		const album = track.album
		if (!connectingAlbum && album) {
			try {
				await new Promise<void>(resolve => this.#findAlbum(album.id).finally(resolve))
			} catch (error) {
				// catching so that a track can still send its invalidation signal if the album fails
				console.error(e)
			}
		}
		socketServer.send("invalidate:track", { id })
		return true
	}

	async #findArtist(id: string) {
		const artist = await prisma.artist.findUnique({
			where: { id },
			select: {
				name: true,
				lastfm: { select: { id: true } },
				audiodb: { select: { strMusicBrainzID: true } },
				tracks: {
					select: { id: true, lastfm: { select: { id: true } } },
					where: { NOT: { lastfm: null } },
				},
				albums: {
					select: { id: true, lastfm: { select: { id: true } } },
					where: { NOT: { lastfm: null } },
				},
			}
		})
		if (!artist) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm failed to find artist ${id} in prisma.artist`)
			return false
		}
		if (artist.lastfm) {
			return false
		}
		const urls: URL[] = []
		if (artist.audiodb?.strMusicBrainzID) {
			urls.push(makeArtistUrl({ mbid: artist.audiodb.strMusicBrainzID }))
		}
		urls.push(makeArtistUrl({ artist: artist.name }))
		let artistData
		for (const url of urls) {
			await this.#queue.next()
			const data = await fetch(url)
			const json = await data.json()
			const lastfm = lastFmArtistSchema.parse(json)
			if (lastfm.artist && lastfm.artist.url) {
				// no `url` field is usually a sign of poor quality data
				artistData = lastfm.artist
				break
			}
		}
		if (!artistData) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm no result for ${artist.name} w/ ${urls.length} tries`)
			return false
		}
		let coverId
		const image = artistData.image.at(-1)?.["#text"]
		if (image) {
			const { hash, path, mimetype, palette } = await fetchAndWriteImage(lastfmImageToUrl(image))
			if (hash && palette && path) {
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
		}
		const connectingTracks = artist.tracks.filter(({ lastfm }) => Boolean(lastfm))
		const connectingAlbums = artist.albums.filter(({ lastfm }) => Boolean(lastfm))
		const lastfmArtist = await prisma.lastFmArtist.create({
			data: {
				entityId: id,
				...(connectingTracks.length ? { tracks: { connect: connectingTracks.map(({ lastfm }) => ({ id: lastfm?.id })) } } : {}),
				...(connectingAlbums.length ? { albums: { connect: connectingAlbums.map(({ lastfm }) => ({ id: lastfm?.id })) } } : {}),
				url: artistData.url,
				mbid: artistData.mbid,
				name: artistData.name,
				listeners: artistData.stats.listeners,
				playcount: artistData.stats.playcount,
				tags: {
					connectOrCreate: artistData.tags.tag.map(tag => ({
						where: { url: tag.url },
						create: {
							name: tag.name,
							url: tag.url,
						}
					}))
				},
				coverUrl: image,
				coverId,
			},
		})
		if (artistData.mbid) {
			// TODO: shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			await prisma.audioDbArtist.updateMany({
				where: { strMusicBrainzID: artistData.mbid },
				data: { entityId: id },
			})
		}
		socketServer.send("invalidate:artist", { id })
		connectingTracks.forEach(({ id }) => socketServer.send("invalidate:track", { id }))
		connectingAlbums.forEach(({ id }) => socketServer.send("invalidate:album", { id }))
		return true
	}

	async #findAlbum(id: string) {
		const album = await prisma.album.findUnique({
			where: { id },
			select: {
				name: true,
				lastfm: { select: { id: true } },
				audiodb: { select: { strMusicBrainzID: true } },
				tracks: {
					select: { id: true, lastfm: { select: { id: true } } },
					where: { NOT: { lastfm: null } },
				},
				artist: {
					select: {
						id: true,
						name: true,
						lastfm: { select: { id: true } }
					},
				},
			}
		})
		if (!album) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm failed to find album ${id} in prisma.album`)
			return false
		}
		if (album.lastfm) {
			return false
		}
		const urls: URL[] = []
		if (album.audiodb?.strMusicBrainzID) {
			urls.push(makeAlbumUrl({ mbid: album.audiodb.strMusicBrainzID }))
		}
		if (album.artist) {
			urls.push(makeAlbumUrl({ album: album.name, artist: album.artist.name }))
		}
		if (urls.length === 0) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm not enough info to look up album ${album.name}`)
			return false
		}
		let albumData
		for (const url of urls) {
			await this.#queue.next()
			const data = await fetch(url)
			const json = await data.json()
			const lastfm = lastFmAlbumSchema.parse(json)
			if (lastfm.album && lastfm.album.url) {
				// no `url` field is usually a sign of poor quality data
				albumData = lastfm.album
				break
			}
		}
		if (!albumData) {
			console.log(`\x1b[31m404  \x1b[0m - lastfm no result for ${album.name} w/ ${urls.length} tries`)
			return false
		}
		let coverId
		const image = albumData.image.at(-1)?.["#text"]
		if (image) {
			const { hash, path, mimetype, palette } = await fetchAndWriteImage(lastfmImageToUrl(image))
			if (hash && palette && path) {
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
		}
		const connectingArtist = album.artist?.lastfm?.id
		const connectingTracks = Array.from(new Set([
			...album.tracks.map(({ lastfm }) => lastfm?.id),
			...await findConnectingTracksForAlbum(albumData)
		].filter(Boolean))) as string[]
		await prisma.lastFmAlbum.create({
			data: {
				entityId: id,
				...(connectingArtist ? { artistId: connectingArtist } : {}),
				...(connectingTracks.length ? { tracks: { connect: connectingTracks.map((id) => ({ id })) } } : {}),
				url: albumData.url,
				mbid: albumData.mbid,
				name: albumData.name,
				listeners: albumData.listeners,
				playcount: albumData.playcount,
				...(albumData.toptags?.tag.length ? {
					tags: {
						connectOrCreate: albumData.toptags.tag.map(tag => ({
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
		if (albumData.mbid) {
			// TODO: shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			await prisma.audioDbAlbum.updateMany({
				where: { strMusicBrainzID: albumData.mbid },
				data: { entityId: id },
			})
		}
		socketServer.send("invalidate:album", { id })
		if (connectingArtist)
			socketServer.send("invalidate:artist", { id: connectingArtist })
		connectingTracks.forEach((id) => socketServer.send("invalidate:track", { id }))
		return true
	}
}

function makeApiUrl() {
	const url = new URL('/2.0', 'http://ws.audioscrobbler.com')
	url.searchParams.set('format', 'json')
	url.searchParams.set('api_key', env.LAST_FM_API_KEY)
	url.searchParams.set('autocorrect', '1')
	return url
}

function makeTrackUrl(params: {
	artist: string,
	track: string,
} | {
	mbid: string,
}) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'track.getInfo')
	if ('mbid' in params) {
		url.searchParams.set('mbid', params.mbid)
	} else {
		url.searchParams.set('track', sanitizeString(params.track))
		url.searchParams.set('artist', sanitizeString(params.artist))
	}
	return url
}

function makeAlbumUrl(params: {
	artist: string,
	album: string,
} | {
	mbid: string,
}) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'album.getInfo')
	if ('mbid' in params) {
		url.searchParams.set('mbid', params.mbid)
	} else {
		url.searchParams.set('album', sanitizeString(params.album))
		url.searchParams.set('artist', sanitizeString(params.artist))
	}
	return url
}

function makeArtistUrl(params: {
	artist: string,
} | {
	mbid: string,
}) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'artist.getInfo')
	if ('mbid' in params) {
		url.searchParams.set('mbid', params.mbid)
	} else {
		url.searchParams.set('artist', sanitizeString(params.artist))
	}
	return url
}

async function findConnectingArtistForTrack(trackData: Exclude<z.infer<typeof lastFmTrackSchema>['track'], undefined>) {
	if (!trackData.artist?.url) {
		return undefined
	}
	const artist = await prisma.lastFmArtist.findUnique({
		where: { url: trackData.artist.url },
		select: { id: true },
	})
	if (!artist) {
		return undefined
	}
	return artist.id
}

async function findConnectingAlbumForTrack(trackData: Exclude<z.infer<typeof lastFmTrackSchema>['track'], undefined>) {
	if (!trackData.album?.url) {
		return undefined
	}
	const album = await prisma.lastFmAlbum.findUnique({
		where: { url: trackData.album.url },
		select: { id: true },
	})
	if (!album) {
		return undefined
	}
	return album.id
}

async function findConnectingTracksForAlbum(albumData: Exclude<z.infer<typeof lastFmAlbumSchema>['album'], undefined>) {
	const tracks = albumData.tracks?.track
	if (!tracks || !Array.isArray(tracks) || !tracks.length) {
		return []
	}
	const urls = tracks.map(({ url }) => url)
	const connections = await prisma.lastFmTrack.findMany({
		where: { url: { in: urls } },
		select: { id: true },
	})
	return connections.map(({ id }) => id)
}


declare global {
	// eslint-disable-next-line no-var
	var lastFm: LastFM | null;
}

export const lastFm = globalThis.lastFm
	|| new LastFM()

if (env.NODE_ENV !== "production") {
	globalThis.lastFm = lastFm
}
