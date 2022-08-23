import { env } from "env/server.mjs"
import { z } from "zod"
import Queue from "utils/Queue"
import { prisma } from "server/db/client"
import { fetchAndWriteImage } from "utils/writeImage"
import sanitizeString from "utils/sanitizeString"
import { socketServer } from "server/persistent/ws"
import lastfmImageToUrl from "utils/lastfmImageToUrl"
import log from "utils/logger"
import retryable from "utils/retryable"

const lastFmCorrectionArtistSchema = z
	.object({
		corrections: z.union([
			z.object({
				correction: z.object({
					artist: z.object({
						name: z.string().optional(),
					})
				}),
			}).optional(),
			z.string()
		])
	})

const lastFmCorrectionTrackSchema = z
	.object({
		corrections: z.union([
			z.object({
				correction: z.object({
					track: z.object({
						name: z.string().optional(),
						artist: z.object({
							name: z.string().optional(),
						})
					})
				}),
			}).optional(),
			z.string()
		])
	})

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
	static STORAGE_LIMIT = 100

	#queue: Queue
	#waitlist: WaitlistEntry[] = []

	constructor() {
		this.#queue = new Queue(LastFM.RATE_LIMIT)
	}

	async #processWaitlist() {
		if (this.#waitlist.length === 1) {
			while (this.#waitlist.length) {
				try {
					await this.#waitlist[0]?.()
					this.#waitlist.shift()
				} catch (e) {
					// catching, just in case, so that 1 item in the waiting list doesn't ruin the entire list
					console.error(e)
				}
			}
		}
	}

	async correctArtist(artist: string) {
		const promise = new Promise<string>(resolve => this.#waitlist.push(() => this.#correctArtist(artist).then(resolve)))
		this.#processWaitlist()
		return promise
	}
	async correctTrack(artist: string, track: string) {
		const promise = new Promise<string>(resolve => this.#waitlist.push(() => this.#correctTrack(artist, track).then(resolve)))
		this.#processWaitlist()
		return promise
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

	#pastRequests: string[] = []
	#pastResponses = new Map<string, any>()

	#purgeStoreTimeout: NodeJS.Timeout | null = null
	#purgeStore() {
		if (!this.#purgeStoreTimeout) {
			this.#purgeStoreTimeout = setTimeout(() => {
				this.#purgeStoreTimeout = null
				if (this.#pastRequests.length > 0) {
					const key = this.#pastRequests.shift() as string
					this.#pastResponses.delete(key)
				}
				if (this.#pastRequests.length > 0) {
					this.#purgeStore()
				}
			}, 60_000)
		}
	}

	async fetch(url: URL | string) {
		const string = url.toString()
		if (this.#pastResponses.has(string)) {
			return this.#pastResponses.get(string)
		}
		await this.#queue.next()
		const json = await retryable(async () => {
			const data = await fetch(url)
			const json = await data.json()
			return json
		})
		this.#pastResponses.set(string, json)
		this.#pastRequests.push(string)
		if (this.#pastRequests.length > LastFM.STORAGE_LIMIT) {
			const pastString = this.#pastRequests.shift() as string
			this.#pastResponses.delete(pastString)
		}
		this.#purgeStore()
		return json
	}

	async #correctArtist(artist: string) {
		const url = makeArtistCorrectionUrl(sanitizeString(artist))
		try {
			const json = await this.fetch(url)
			const lastfm = lastFmCorrectionArtistSchema.parse(json)
			if (typeof lastfm.corrections === "object" && lastfm.corrections?.correction?.artist?.name) {
				return lastfm.corrections.correction.artist.name
			}
		} catch (e) {
			console.log(`error while correcting artist ${artist}`)
			console.error(e)
		}
		return artist
	}

	async #correctTrack(artist: string, track: string) {
		const url = makeTrackCorrectionUrl(sanitizeString(artist), sanitizeString(track))
		try {
			const json = await this.fetch(url)
			const lastfm = lastFmCorrectionTrackSchema.parse(json)
			if (typeof lastfm.corrections === "object" && lastfm.corrections?.correction?.track?.name) {
				return lastfm.corrections.correction.track.name
			}
		} catch (e) {
			console.log(`error while correcting track ${track} by ${artist}`)
			console.error(e)
		}
		return track
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
			log("error", "404", "lastfm", `failed to find track ${id} in prisma.track`)
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
			log("warn", "404", "lastfm", `not enough info to look up track ${track.name}`)
			return false
		}
		let _trackData: z.infer<typeof lastFmTrackSchema>['track'] | null = null
		for (const url of urls) {
			const json = await this.fetch(url)
			const lastfm = lastFmTrackSchema.parse(json)
			if (lastfm.track && lastfm.track.url) {
				// no `url` field is usually a sign of poor quality data
				_trackData = lastfm.track
				break
			} else if (lastfm.track) {
				log("info", "pass", "lastfm", `discard result for track ${track.name}, found ${lastfm.track.name} but no 'url' field`)
			}
		}
		if (!_trackData) {
			log("warn", "404", "lastfm", `no result for track ${track.name} w/ ${urls.length} tries`)
			return false
		}

		const trackData = _trackData

		const connectingArtist = track.artist?.lastfm?.id || await findConnectingArtistForTrack(trackData)
		const connectingAlbum = track.album?.lastfm?.id || await findConnectingAlbumForTrack(trackData)
		const trackData_duration = trackData.duration
		const trackData_listeners = trackData.listeners
		const trackData_playcount = trackData.playcount
		const trackData_mbid = trackData.mbid
		const trackData_name = trackData.name
		const trackData_url = trackData.url
		const trackData_toptags_tag = trackData.toptags.tag
		await retryable(async () => {
			await prisma.lastFmTrack.create({
				data: {
					entityId: id,
					...(connectingAlbum ? { albumId: connectingAlbum } : {}),
					...(connectingArtist ? { artistId: connectingArtist } : {}),
					duration: trackData_duration,
					listeners: trackData_listeners,
					playcount: trackData_playcount,
					mbid: trackData_mbid,
					name: trackData_name,
					url: trackData_url,
					tags: {
						connectOrCreate: trackData_toptags_tag
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
		})
		if (trackData.mbid) {
			// TODO: (not sure this is true) shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			const mbid = trackData.mbid
			await retryable(async () => {
				await prisma.audioDbTrack.updateMany({
					where: {
						strMusicBrainzID: mbid,
						entityId: undefined,
					},
					data: { entityId: id },
				})
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
			} catch (e) {
				// catching so that a track can still send its invalidation signal if the album fails
				console.error(e)
			}
		}
		socketServer.send("invalidate:track", { id })
		log("info", "200", "lastfm", `fetched track ${track.name}`)
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
			log("error", "404", "lastfm", `failed to find artist ${id} in prisma.artist`)
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
		let artistData: z.infer<typeof lastFmArtistSchema>['artist'] | null = null
		for (const url of urls) {
			const json = await this.fetch(url)
			const lastfm = lastFmArtistSchema.parse(json)
			if (lastfm.artist && lastfm.artist.url) {
				// no `url` field is usually a sign of poor quality data
				artistData = lastfm.artist
				break
			} else if (lastfm.artist) {
				log("info", "pass", "lastfm", `discard result for artist ${artist.name}, found ${lastfm.artist.name} but no 'url' field`)
			}
		}
		if (!artistData) {
			log("warn", "404", "lastfm", `no result for artist ${artist.name} w/ ${urls.length} tries`)
			return false
		}
		let coverId: string | null = null
		const image = artistData.image.at(-1)?.["#text"]
		if (image) {
			const { hash, path, mimetype, palette } = await fetchAndWriteImage(lastfmImageToUrl(image))
			if (hash && palette && path) {
				await retryable(async () => {
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
				})
			}
		}
		const connectingTracks = artist.tracks.filter(({ lastfm }) => Boolean(lastfm))
		const connectingAlbums = artist.albums.filter(({ lastfm }) => Boolean(lastfm))
		const artistData_mbid = artistData.mbid
		const artistData_name = artistData.name
		const artistData_stats_listeners = artistData.stats.listeners
		const artistData_stats_playcount = artistData.stats.playcount
		const artistData_url = artistData.url
		const artistData_tags_tag = artistData.tags.tag
		await retryable(async () => {
			await prisma.lastFmArtist.create({
				data: {
					entityId: id,
					...(connectingTracks.length ? { tracks: { connect: connectingTracks.map(({ lastfm }) => ({ id: lastfm?.id })) } } : {}),
					...(connectingAlbums.length ? { albums: { connect: connectingAlbums.map(({ lastfm }) => ({ id: lastfm?.id })) } } : {}),
					mbid: artistData_mbid,
					name: artistData_name,
					listeners: artistData_stats_listeners,
					playcount: artistData_stats_playcount,
					url: artistData_url,
					tags: {
						connectOrCreate: artistData_tags_tag.map(tag => ({
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
		})
		if (artistData.mbid) {
			// TODO: (not sure this is true) shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			const mbid = artistData.mbid
			await retryable(async () => {
				await prisma.audioDbArtist.updateMany({
					where: {
						strMusicBrainzID: mbid,
						entityId: undefined,
					},
					data: { entityId: id },
				})
			})
		}
		socketServer.send("invalidate:artist", { id })
		connectingTracks.forEach(({ id }) => socketServer.send("invalidate:track", { id }))
		connectingAlbums.forEach(({ id }) => socketServer.send("invalidate:album", { id }))
		log("info", "200", "lastfm", `fetched artist ${artist.name}`)
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
			log("error", "404", "lastfm", `failed to find album ${id} in prisma.album`)
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
			log("warn", "404", "lastfm", `not enough info to look up album ${album.name}`)
			return false
		}
		let albumData: z.infer<typeof lastFmAlbumSchema>['album'] | null = null
		for (const url of urls) {
			const json = await this.fetch(url)
			const lastfm = lastFmAlbumSchema.parse(json)
			if (lastfm.album && lastfm.album.url) {
				// no `url` field is usually a sign of poor quality data
				albumData = lastfm.album
				break
			} else if (lastfm.album) {
				log("info", "pass", "lastfm", `discard result for album ${album.name}, found ${lastfm.album.name} but no 'url' field`)
			}
		}
		if (!albumData) {
			log("warn", "404", "lastfm", `no result for album ${album.name} w/ ${urls.length} tries`)
			return false
		}
		let coverId: string | null = null
		const image = albumData.image.at(-1)?.["#text"]
		if (image) {
			const { hash, path, mimetype, palette } = await fetchAndWriteImage(lastfmImageToUrl(image))
			if (hash && palette && path) {
				await retryable(async () => {
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
				})
			}
		}
		const connectingArtist = album.artist?.lastfm?.id
		const connectingTracks = Array.from(new Set([
			...album.tracks.map(({ lastfm }) => lastfm?.id),
			...await findConnectingTracksForAlbum(albumData)
		].filter(Boolean))) as string[]
		const albumData_mbid = albumData.mbid
		const albumData_name = albumData.name
		const albumData_listeners = albumData.listeners
		const albumData_playcount = albumData.playcount
		const albumData_url = albumData.url
		const albumData_toptags = albumData.toptags
		await retryable(async () => {
			await prisma.lastFmAlbum.create({
				data: {
					entityId: id,
					...(connectingArtist ? { artistId: connectingArtist } : {}),
					...(connectingTracks.length ? { tracks: { connect: connectingTracks.map((id) => ({ id })) } } : {}),
					mbid: albumData_mbid,
					name: albumData_name,
					listeners: albumData_listeners,
					playcount: albumData_playcount,
					url: albumData_url,
					...(albumData_toptags?.tag.length ? {
						tags: {
							connectOrCreate: albumData_toptags.tag.map(tag => ({
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
		})
		if (albumData.mbid) {
			// TODO: (not sure this is true) shouldn't manipulate directly, but enqueue in a persistent/audiodb class to avoid race conditions that make prisma panic
			const mbid = albumData.mbid
			await retryable(async () => {
				await prisma.audioDbAlbum.updateMany({
					where: {
						strMusicBrainzID: mbid,
						entityId: undefined
					},
					data: { entityId: id },
				})
			})
		}
		socketServer.send("invalidate:album", { id })
		if (connectingArtist)
			socketServer.send("invalidate:artist", { id: connectingArtist })
		connectingTracks.forEach((id) => socketServer.send("invalidate:track", { id }))
		log("info", "200", "lastfm", `fetched album ${album.name}`)
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

function makeArtistCorrectionUrl(artist: string) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'artist.getcorrection')
	url.searchParams.set('artist', artist)
	return url
}

function makeTrackCorrectionUrl(artist: string, track: string) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'track.getcorrection')
	url.searchParams.set('artist', artist)
	url.searchParams.set('track', track)
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
	const artist = await prisma.lastFmArtist.findFirst({
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
	const album = await prisma.lastFmAlbum.findFirst({
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
