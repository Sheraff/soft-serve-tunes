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
import { notArtistName } from "server/db/createTrack"
import similarStrings from "utils/similarStrings"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"

const lastFmErrorSchema = z
	.object({
		message: z.string(),
		error: z.number(),
	})

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

const lastFmImageSchema = z.object({
	'#text': z.string(),
	size: z.string(),
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
			image: z.array(lastFmImageSchema),
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

const lastFmAlbumSearch = z
	.object({
		results: z.object({
			albummatches: z.object({
				album: z.array(z.object({
					name: z.string(),
					artist: z.string(),
					url: z.string(),
					image: z.array(lastFmImageSchema),
					mbid: z.string(),
				})).optional()
			}).optional()
		}).optional()
	})

const lastFmTrackSearch = z
	.object({
		results: z.object({
			trackmatches: z.object({
				track: z.array(z.object({
					name: z.string(),
					artist: z.string(),
					url: z.string(),
					mbid: z.string(),
				})).optional()
			}).optional()
		}).optional()
	})

type KnownLastFmSchema = 
	| typeof lastFmCorrectionArtistSchema
	| typeof lastFmCorrectionTrackSchema
	| typeof lastFmArtistSchema
	| typeof lastFmAlbumSchema
	| typeof lastFmTrackSchema
	| typeof lastFmAlbumSearch
	| typeof lastFmTrackSearch

type WaitlistEntry = (() => Promise<void>)

class LastFM {
	static RATE_LIMIT = 170
	static STORAGE_LIMIT = 30

	#queue: Queue
	#waitlist: WaitlistEntry[] = []

	constructor() {
		this.#queue = new Queue(LastFM.RATE_LIMIT, { wait: true })
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
		const promise = new Promise<string | false>(resolve => this.#waitlist.push(() => this.#correctArtist(artist).then(resolve)))
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

	async fetch<T extends KnownLastFmSchema>(url: URL | string, schema: T): Promise<z.infer<T>> {
		const string = url.toString()
		if (this.#pastResponses.has(string)) {
			return this.#pastResponses.get(string)
		}
		const json = await retryable(async () => {
			const data = await this.#queue.push(() => fetch(url))
			const json = await data.json()
			const parsed = z.union([schema, lastFmErrorSchema]).parse(json)
			if ("error" in parsed) {
				if (parsed.error === 29 || parsed.error === 11 || parsed.error === 2) {
					this.#queue.delay()
				}
				log("error", parsed.error.toString(), "lastfm", `${url}: ${parsed.message}`)
				throw new Error(parsed.message)
			} else {
				return parsed
			}
		}) as z.infer<T>
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
			const lastfm = await this.fetch(url, lastFmCorrectionArtistSchema)
			if (typeof lastfm.corrections === "object" && lastfm.corrections?.correction?.artist?.name) {
				return lastfm.corrections.correction.artist.name
			}
		} catch (e) {
			console.log(`error while correcting artist ${artist}`)
			console.error(e)
		}
		return false
	}

	async #correctTrack(artist: string, track: string) {
		const url = makeTrackCorrectionUrl(sanitizeString(artist), sanitizeString(track))
		try {
			const lastfm = await this.fetch(url, lastFmCorrectionTrackSchema)
			if (typeof lastfm.corrections === "object" && lastfm.corrections?.correction?.track?.name) {
				return lastfm.corrections.correction.track.name
			}
		} catch (e) {
			console.log(`error while correcting track ${track} by ${artist}`)
			console.error(e)
		}
		return track
	}

	#running = new Set<string>()

	async #findTrack(id: string) {
		if (this.#running.has(id)) {
			return false
		}
		this.#running.add(id)
		const datedTrack = await prisma.track.findUnique({
			where: { id },
			select: {
				lastfmDate: true,
			}
		})
		if (!datedTrack) {
			log("error", "404", "lastfm", `failed to find track ${id} in prisma.track`)
			this.#running.delete(id)
			return false
		}
		if (datedTrack.lastfmDate && datedTrack.lastfmDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
			this.#running.delete(id)
			return false
		}
		await retryable(() => (
			prisma.track.update({
				where: { id },
				data: { lastfmDate: new Date().toISOString() },
			})
		))
		const track = await prisma.track.findUnique({
			where: { id },
			select: {
				name: true,
				mbid: true,
				lastfm: { select: { id: true } },
				lastfmDate: true,
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
			log("error", "404", "lastfm", `couldn't find track ${id} we had a second ago`)
			this.#running.delete(id)
			return false
		}
		if (track.lastfm) {
			this.#running.delete(id)
			return false
		}
		const urls: URL[] = []
		if (track.mbid) {
			urls.push(makeTrackUrl({ mbid: track.mbid }))
		}
		if (track.audiodb?.strMusicBrainzID) {
			urls.push(makeTrackUrl({ mbid: track.audiodb.strMusicBrainzID }))
		}
		if (track.artist) {
			urls.push(makeTrackUrl({ artist: sanitizeString(track.artist.name), track: sanitizeString(track.name) }))
		}
		if (track.album?.artist?.name && !notArtistName(track.album.artist.name)) {
			urls.push(makeTrackUrl({ artist: sanitizeString(track.album.artist.name), track: sanitizeString(track.name) }))
		}
		let _trackData: z.infer<typeof lastFmTrackSchema>['track'] | null = null
		const fetchUrls = async (urls: URL[]) => {
			for (const url of urls) {
				const lastfm = await this.fetch(url, lastFmTrackSchema)
				if (lastfm.track && lastfm.track.url) {
					// no `url` field is usually a sign of poor quality data
					return lastfm.track
				} else if (lastfm.track) {
					log("info", "pass", "lastfm", `discard result for track ${track.name}, found ${lastfm.track.name} but no 'url' field`)
				}
			}
		}
		_trackData = await fetchUrls(urls)
		if (!_trackData) {
			if (!track.album?.name || !track.artist?.name) {
				log("warn", "404", "lastfm", `not enough info to look up track ${track.name} by ${track.artist?.name || track.album?.artist?.name}`)
				this.#running.delete(id)
				return false
			}
			const extraUrls = await this.#searchTrackUrls(track.name, track.album.name, track.artist.name)
			if (!extraUrls.length) {
				log("warn", "404", "lastfm", `no lastfm search result for track ${track.name} by ${track.artist?.name || track.album?.artist?.name}`)
				this.#running.delete(id)
				return false
			}
			_trackData = await fetchUrls(extraUrls)
			if (!_trackData) {
				log("warn", "404", "lastfm", `no result for track ${track.name} by ${track.artist?.name || track.album?.artist?.name} w/ ${urls.length} tries + ${extraUrls.length} searches`)
				this.#running.delete(id)
				return false
			}
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
		const artist = track.artist
		if (!connectingArtist && artist) {
			try {
				await this.#findArtist(artist.id)
			} catch (e) {
				// catching so that a track can still send its invalidation signal if the artist fails
				console.error(e)
			}
		}
		const album = track.album
		if (!connectingAlbum && album) {
			try {
				await this.#findAlbum(album.id)
			} catch (e) {
				// catching so that a track can still send its invalidation signal if the album fails
				console.error(e)
			}
		}
		const trackChangedCover = await computeTrackCover(id, {album: true, artist: true})
		if (!trackChangedCover) {
			socketServer.send("invalidate:track", { id })
		}
		log("info", "200", "lastfm", `fetched track ${track.name}`)
		this.#running.delete(id)
		return true
	}

	async #searchTrackUrls(trackName: string, albumName: string, artistName: string) {
		const url = makeTrackSearchUrl({ track: trackName, album: albumName })
		const lastfm = await this.fetch(url, lastFmTrackSearch)
		const albumsFound = lastfm.results?.trackmatches?.track || []
		const matchByName = albumsFound.filter(({name, artist}) => {
			const similarTrackName = similarStrings(name, trackName)
			if (!similarTrackName) return false
			return similarStrings(artist, artistName)
		})
		const matchWithMbid = matchByName.filter(({mbid}) => mbid)
		const match = matchWithMbid[0] || matchByName[0]
		const urls: URL[] = []
		if (!match) {
			return urls
		}
		if (match.mbid) {
			urls.push(makeTrackUrl({ mbid: match.mbid }))
		}
		urls.push(makeTrackUrl({ track: trackName, artist: match.artist }))
		return urls
	}

	async #findArtist(id: string) {
		if (this.#running.has(id)) {
			return false
		}
		this.#running.add(id)
		const datedArtist = await prisma.artist.findUnique({
			where: { id },
			select: {
				lastfmDate: true,
			}
		})
		if (!datedArtist) {
			log("error", "404", "lastfm", `failed to find artist ${id} in prisma.artist`)
			this.#running.delete(id)
			return false
		}
		if (datedArtist.lastfmDate && datedArtist.lastfmDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
			this.#running.delete(id)
			return false
		}
		await retryable(() => (
			prisma.artist.update({
				where: { id },
				data: { lastfmDate: new Date().toISOString() },
			})
		))
		const artist = await prisma.artist.findUnique({
			where: { id },
			select: {
				name: true,
				mbid: true,
				lastfm: { select: { id: true } },
				lastfmDate: true,
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
			log("error", "404", "lastfm", `couldn't find artist ${id} we had a second ago`)
			this.#running.delete(id)
			return false
		}
		if (artist.lastfm) {
			this.#running.delete(id)
			return false
		}
		const urls: URL[] = []
		if (artist.mbid) {
			urls.push(makeArtistUrl({ mbid: artist.mbid }))
		}
		if (artist.audiodb?.strMusicBrainzID) {
			urls.push(makeArtistUrl({ mbid: artist.audiodb.strMusicBrainzID }))
		}
		urls.push(makeArtistUrl({ artist: artist.name }))
		let artistData: z.infer<typeof lastFmArtistSchema>['artist'] | null = null
		for (const url of urls) {
			const lastfm = await this.fetch(url, lastFmArtistSchema)
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
			this.#running.delete(id)
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
		const artistChangedCover = await computeArtistCover(id, {tracks: false, album: false})
		if (!artistChangedCover) {
			socketServer.send("invalidate:artist", { id })
		}
		Promise.resolve().then(async () => {
			for (const album of connectingAlbums) {
				const albumChangedCover = await computeAlbumCover(album.id, {artist: true, tracks: true})
				if (!albumChangedCover) {
					socketServer.send("invalidate:album", { id: album.id })
				}
			}
			for (const track of connectingTracks) {
				const trackChangedCover = await computeTrackCover(track.id, {album: true, artist: true})
				if (!trackChangedCover) {
					socketServer.send("invalidate:track", { id: track.id })
				}
			}
		})
		log("info", "200", "lastfm", `fetched artist ${artist.name}`)
		this.#running.delete(id)
		return true
	}

	async #findAlbum(id: string) {
		if (this.#running.has(id)) {
			return false
		}
		this.#running.add(id)
		const datedAlbum = await prisma.album.findUnique({
			where: { id },
			select: {
				lastfmDate: true,
			}
		})
		if (!datedAlbum) {
			log("error", "404", "lastfm", `failed to find album ${id} in prisma.album`)
			this.#running.delete(id)
			return false
		}
		if (datedAlbum.lastfmDate && datedAlbum.lastfmDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
			this.#running.delete(id)
			return false
		}
		await retryable(() => (
			prisma.album.update({
				where: { id },
				data: { lastfmDate: new Date().toISOString() },
			})
		))
		const album = await prisma.album.findUnique({
			where: { id },
			select: {
				name: true,
				mbid: true,
				lastfm: { select: { id: true } },
				lastfmDate: true,
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
			log("error", "404", "lastfm", `couldn't find album ${id} we had a second ago`)
			this.#running.delete(id)
			return false
		}
		if (album.lastfm) {
			this.#running.delete(id)
			return false
		}
		const urls: URL[] = []
		if (album.mbid) {
			urls.push(makeAlbumUrl({ mbid: album.mbid }))
		}
		if (album.audiodb?.strMusicBrainzID) {
			urls.push(makeAlbumUrl({ mbid: album.audiodb.strMusicBrainzID }))
		}
		if (album.artist) {
			urls.push(makeAlbumUrl({ album: album.name, artist: album.artist.name }))
		}
		let albumData: z.infer<typeof lastFmAlbumSchema>['album'] | null = null
		const fetchUrls = async (urls: URL[]) => {
			for (const url of urls) {
				const lastfm = await this.fetch(url, lastFmAlbumSchema)
				if (lastfm.album && lastfm.album.url) {
					// no `url` field is usually a sign of poor quality data
					return lastfm.album
				} else if (lastfm.album) {
					log("info", "pass", "lastfm", `discard result for album ${album.name}, found ${lastfm.album.name} but no 'url' field`)
				}
			}
		}
		albumData = await fetchUrls(urls)
		if (!albumData) {
			const url = makeAlbumSearchUrl({ album: album.name })
			const lastfm = await this.fetch(url, lastFmAlbumSearch)
			const albumsFound = lastfm.results?.albummatches?.album || []
			const matchByName = albumsFound.filter(({name, artist}) => {
				const similarAlbumName = similarStrings(name, album.name)
				if (!similarAlbumName) return false
				
				if (album.artist?.name) {
					const similarArtistName = similarStrings(artist, album.artist.name)
					return similarArtistName
				}
				return true
			})
			const matchWithMbid = matchByName.filter(({mbid}) => mbid)
			const match = matchWithMbid[0] || matchByName[0]
			if (!match || !match.artist) {
				log("warn", "404", "lastfm", `not enough info to look up album ${album.name}`)
				this.#running.delete(id)
				return false
			}
			const extraUrls: URL[] = []
			if (match.mbid) {
				extraUrls.push(makeAlbumUrl({ mbid: match.mbid }))
			}
			extraUrls.push(makeAlbumUrl({ album: album.name, artist: match.artist }))
			albumData = await fetchUrls(extraUrls)
			if (!albumData) {
				log("warn", "404", "lastfm", `no result for album ${album.name} w/ ${urls.length} tries + ${extraUrls.length} searches`)
				this.#running.delete(id)
				return false
			}
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
		const foundConnectingTracks = await findConnectingTracksForAlbum(albumData)
		const connectingTracks = Array.from(new Set([
			...album.tracks.map(({ lastfm }) => lastfm?.id),
			...foundConnectingTracks,
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
		const albumChangedCover = await computeAlbumCover(id, {tracks: false, artist: true})
		if (!albumChangedCover) {
			socketServer.send("invalidate:album", { id })
		}
		if (connectingArtist) {
			const artistChangedCover = await computeArtistCover(connectingArtist, {tracks: false, album: false})
			if (!artistChangedCover) {
				socketServer.send("invalidate:artist", { id: connectingArtist })
			}
		}
		Promise.resolve().then(async () => {
			for (const track of connectingTracks) {
				const trackChangedCover = await computeTrackCover(track, {album: true, artist: true})
				if (!trackChangedCover) {
					socketServer.send("invalidate:track", { id: track })
				}
			}
		})
		log("info", "200", "lastfm", `fetched album ${album.name}`)
		this.#running.delete(id)
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
		url.searchParams.set('track', params.track)
		url.searchParams.set('artist', params.artist)
	}
	return url
}

function makeTrackSearchUrl(params: {
	track: string,
	album: string,
}) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'track.search')
	url.searchParams.set('track', sanitizeString(params.track) || params.track)
	url.searchParams.set('album', sanitizeString(params.album) || params.album)
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
		url.searchParams.set('album', sanitizeString(params.album) || params.album)
		url.searchParams.set('artist', sanitizeString(params.artist) || params.artist)
	}
	return url
}

function makeAlbumSearchUrl(params: {
	album: string,
}) {
	const url = makeApiUrl()
	url.searchParams.set('method', 'album.search')
	url.searchParams.set('album', sanitizeString(params.album) || params.album)
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
		url.searchParams.set('artist', sanitizeString(params.artist) || params.artist)
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

// if (env.NODE_ENV !== "production") {
	globalThis.lastFm = lastFm
// }
