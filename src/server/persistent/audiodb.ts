import { socketServer } from "server/persistent/ws"
import { env } from "env/server.mjs"
import { z } from "zod"
import { fetchAndWriteImage } from "utils/writeImage"
import Queue from "utils/Queue"
import sanitizeString from "utils/sanitizeString"
import log from "utils/logger"
import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import { uniqueGenres } from "server/db/createTrack"

const audiodbArtistSchema = z.object({artists:
	z.array(z.object({
		idArtist: z.string().transform(Number),
		strArtist: z.string(),
		intFormedYear: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
		intBornYear: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
		strMusicBrainzID: z.union([z.string().optional(), z.null()]),
		strBiographyEN: z.union([z.string().optional(), z.null()]),
		strArtistThumb: z.union([z.string().optional(), z.null()]),
		strArtistLogo: z.union([z.string().optional(), z.null()]),
		strArtistCutout: z.union([z.string().optional(), z.null()]),
		strArtistClearart: z.union([z.string().optional(), z.null()]),
		strArtistWideThumb: z.union([z.string().optional(), z.null()]),
		strArtistBanner: z.union([z.string().optional(), z.null()]),
	}))
})

const audiodbAlbumSchema = z.object({album:
	z.array(z.object({
		idAlbum: z.string().transform(Number),
		idArtist: z.string().transform(Number),
		strAlbum: z.string(),
		intYearReleased: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
		strMusicBrainzID: z.union([z.string().optional(), z.null()]),
		strDescriptionEN: z.union([z.string().optional(), z.null()]),
		strAlbumThumb: z.union([z.string().optional(), z.null()]),
		strAlbumThumbHQ: z.union([z.string().optional(), z.null()]),
		strAlbumCDart: z.union([z.string().optional(), z.null()]),
		strAllMusicID: z.union([z.string().optional(), z.null()]),
		strBBCReviewID: z.union([z.string().optional(), z.null()]),
		strRateYourMusicID: z.union([z.string().optional(), z.null()]),
		strDiscogsID: z.union([z.string().optional(), z.null()]),
		strWikidataID: z.union([z.string().optional(), z.null()]),
		strWikipediaID: z.union([z.string().optional(), z.null()]),
		strGeniusID: z.union([z.string().optional(), z.null()]),
		strLyricWikiID: z.union([z.string().optional(), z.null()]),
		strMusicMozID: z.union([z.string().optional(), z.null()]),
		strItunesID: z.union([z.string().optional(), z.null()]),
		strAmazonID: z.union([z.string().optional(), z.null()]),
	}))
})

const audiodbTrackSchema = z.object({track:
	z.array(z.object({
		idTrack: z.string().transform(Number),
		idAlbum: z.string().transform(Number),
		strTrack: z.string(),
		intDuration: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
		strGenre: z.union([z.string().optional(), z.null()]),
		strTrackThumb: z.union([z.string().optional(), z.null()]),
		strMusicVid: z.union([z.string().optional(), z.null()]),
		intTrackNumber: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
		strMusicBrainzID: z.union([z.string().optional(), z.null()]),
	}))
})
class AudioDb {
	static RATE_LIMIT = 2000

	#queue: Queue
	#hasKey: boolean

	constructor() {
		this.#queue = new Queue(AudioDb.RATE_LIMIT, { wait: true })
		this.#hasKey = Boolean(env.AUDIO_DB_API_KEY)
	}

	static ENDPOINT_SCHEMAS = {
		"search": audiodbArtistSchema, // ?s=artist
		"artist-mb": audiodbArtistSchema, // ?i=mbid
		// "album": audiodbAlbumSchema,
		"album-mb": audiodbArtistSchema, // ?i=mbid
		"searchalbum": audiodbAlbumSchema, // ?s=artist&a=album
		// "track": audiodbTrackSchema,
		"track-mb": audiodbArtistSchema, // ?i=mbid
		"searchtrack": audiodbTrackSchema, // ?s=artist&t=track
	} as const

	async #audiodbFetch(endpoint: keyof typeof AudioDb['ENDPOINT_SCHEMAS'], ...params: [string, string][]) {
		const url = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/${endpoint}.php`, 'https://theaudiodb.com')
		params.forEach(([key, value]) => {
			url.searchParams.append(key, value)
		})
		log("info", "fetch", "audiodb", `${url}`)
		return retryable(async () => {
			const response = await this.#queue.push(() => fetch(url))
			if (response.status === 200 && response.headers.get("Content-Type") !== "application/json") {
				return
			}
			const json = await response.json()
			return json
		})
	}

	#runningArtists = new Set<string>()
	async fetchArtist(id: string) {
		if (!this.#hasKey) return
		if (this.#runningArtists.has(id)) return
		this.#runningArtists.add(id)
		try {
			await this.#fetchArtist(id)
		} catch (e) {
			console.error(e)
		}
		this.#runningArtists.delete(id)
	}

	async #fetchArtist(id: string) {
		const artist = await retryable(() => prisma.artist.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				audiodbDate: true,
				mbid: true,
				lastfm: { select: { mbid: true }},
				audiodb: { select: { idArtist: true }}
			}
		}))

		if (!artist) return
		if (artist.audiodb) return
		if (artist.audiodbDate && artist.audiodbDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) return

		await retryable(() => (
			prisma.artist.update({
				where: { id },
				data: { audiodbDate: new Date().toISOString() },
			})
		))

		const artistsJson = await (async () => {
			log("event", "event", "audiodb", `Looking up artist "${artist.name}"`)
			if (artist.mbid) {
				const json = await this.#audiodbFetch('artist-mb', ['i', artist.mbid])
				if (json?.artists && json.artists.length > 0) return json
			}
			if (artist.lastfm?.mbid) {
				const json = await this.#audiodbFetch('artist-mb', ['i', artist.lastfm.mbid])
				if (json?.artists && json.artists.length > 0) return json
			}
			const json = await this.#audiodbFetch('search', ['s', sanitizeString(artist.name)])
			if (json?.artists && json.artists.length > 0) return json
		})()

		if (!artistsJson) {
			log("warn", "404", "audiodb", `No artist found for "${artist.name}"`)
			return
		}

		const audiodbArtists = audiodbArtistSchema.parse(artistsJson)

		let audiodbArtist: typeof audiodbArtists['artists'][number] | undefined = undefined
		if (audiodbArtists.artists.length === 1) {
			audiodbArtist = audiodbArtists.artists[0]
		} else if (artist.mbid) {
			audiodbArtist = audiodbArtists.artists.find(a => artist.mbid === a.strMusicBrainzID)
		} else if (artist.lastfm?.mbid) {
			audiodbArtist = audiodbArtists.artists.find(a => artist.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbArtist) {
			// TODO: use string distance?
			log("warn", "409", "audiodb", `Multiple artists found for "${artist.name}"`)
			return
		}

		const imageIds = await keysAndInputToImageIds(audiodbArtist, [
			'strArtistThumb',
			'strArtistLogo',
			'strArtistCutout',
			'strArtistClearart',
			'strArtistWideThumb',
			'strArtistBanner',
		])
		await retryable(async () => prisma.audioDbArtist.create({
				data: {
					entityId: id,
					...audiodbArtist!,
					thumbId: imageIds.strArtistThumb,
					logoId: imageIds.strArtistLogo,
					cutoutId: imageIds.strArtistCutout,
					clearartId: imageIds.strArtistClearart,
					wideThumbId: imageIds.strArtistWideThumb,
					bannerId: imageIds.strArtistBanner,
				},
			})
		)
		socketServer.send("invalidate:artist", {id: id})
	}

	#runningAlbums = new Set<string>()
	async fetchAlbum(id: string) {
		if (!this.#hasKey) return
		if (this.#runningAlbums.has(id)) return
		this.#runningAlbums.add(id)
		try {
			await this.#fetchAlbum(id)
		} catch (e) {
			console.error(e)
		}
		this.#runningAlbums.delete(id)
	}

	async #fetchAlbum(id: string) {
		const album = await retryable(() => prisma.album.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				audiodbDate: true,
				mbid: true,
				lastfm: { select: { mbid: true }},
				audiodb: { select: { idAlbum: true }},
				artist: { select: { name: true }},
			}
		}))

		if (!album) return
		if (album.audiodb) return
		if (album.audiodbDate && album.audiodbDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) return

		await retryable(() => (
			prisma.album.update({
				where: { id },
				data: { audiodbDate: new Date().toISOString() },
			})
		))

		const albumsJson = await (async () => {
			log("event", "event", "audiodb", `Looking up album "${album.name}" by "${album.artist?.name}"`)
			if (album.mbid) {
				const json = await this.#audiodbFetch('album-mb', ['i', album.mbid])
				if (json?.album && json.album.length > 0) return json
			}
			if (album.lastfm?.mbid) {
				const json = await this.#audiodbFetch('album-mb', ['i', album.lastfm.mbid])
				if (json?.album && json.album.length > 0) return json
			}
			if (album.artist?.name) {
				const json = await this.#audiodbFetch('searchalbum', ['s', sanitizeString(album.name)], ['a', sanitizeString(album.artist.name)])
				if (json?.album && json.album.length > 0) return json
			}
		})()

		if (!albumsJson) {
			log("warn", "404", "audiodb", `No album found for "${album.name}" by "${album.artist?.name}"`)
			return
		}

		const audiodbAlbums = audiodbAlbumSchema.parse(albumsJson)

		let audiodbAlbum: typeof audiodbAlbums['album'][number] | undefined = undefined
		if (audiodbAlbums.album.length === 1) {
			audiodbAlbum = audiodbAlbums.album[0]
		} else if (album.mbid) {
			audiodbAlbum = audiodbAlbums.album.find(a => album.mbid === a.strMusicBrainzID)
		} else if (album.lastfm?.mbid) {
			audiodbAlbum = audiodbAlbums.album.find(a => album.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbAlbum) {
			// TODO: use string distance?
			log("warn", "409", "audiodb", `Multiple albums found for "${album.name}" by "${album.artist?.name}"`)
			return
		}

		const imageIds = await keysAndInputToImageIds(audiodbAlbum, [
			'strAlbumThumb',
			'strAlbumThumbHQ',
			'strAlbumCDart',
		])
		await retryable(async () => prisma.audioDbAlbum.create({
				data: {
					entityId: id,
					...audiodbAlbum!,
					thumbId: imageIds.strAlbumThumb,
					thumbHqId: imageIds.strAlbumThumbHQ,
					cdArtId: imageIds.strAlbumCDart,
				}
			})
		)
		socketServer.send("invalidate:album", {id})
	}

	#runningTracks = new Set<string>()
	async fetchTrack(id: string) {
		if (!this.#hasKey) return
		if (this.#runningTracks.has(id)) return
		this.#runningTracks.add(id)
		try {
			await this.#fetchTrack(id)
		} catch (e) {
			console.error(e)
		}
		this.#runningTracks.delete(id)
	}

	async #fetchTrack(id: string) {
		const track = await retryable(() => prisma.track.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				audiodbDate: true,
				mbid: true,
				lastfm: { select: { mbid: true }},
				audiodb: { select: { idTrack: true }},
				artist: { select: { name: true }},
				album: { select: { name: true }},
			}
		}))

		if (!track) return
		if (track.audiodb) return
		if (track.audiodbDate && track.audiodbDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) return

		await retryable(() => (
			prisma.track.update({
				where: { id },
				data: { audiodbDate: new Date().toISOString() },
			})
		))

		const tracksJson = await (async () => {
			log("event", "event", "audiodb", `Looking up track "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"`)
			if (track.mbid) {
				const json = await this.#audiodbFetch('track-mb', ['i', track.mbid])
				if (json?.track && json.track.length > 0) return json
			}
			if (track.lastfm?.mbid) {
				const json = await this.#audiodbFetch('track-mb', ['i', track.lastfm.mbid])
				if (json?.track && json.track.length > 0) return json
			}
			if (track.artist?.name) {
				const params = [
					['s', sanitizeString(track.artist.name)],
					['t', sanitizeString(track.name)],
				] as [string, string][]
				if (track.album?.name) {
					params.push(['a', sanitizeString(track.album.name)])
				}
				const json = await this.#audiodbFetch('searchtrack', ...params)
				if (json?.track && json.track.length > 0) return json
			}
		})()

		if (!tracksJson) {
			log("warn", "404", "audiodb", `No track found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"`)
			return
		}

		const audiodbTracks = audiodbTrackSchema.parse(tracksJson)

		let audiodbTrack: typeof audiodbTracks['track'][number] | undefined = undefined
		if (audiodbTracks.track.length === 1) {
			audiodbTrack = audiodbTracks.track[0]
		} else if (track.mbid) {
			audiodbTrack = audiodbTracks.track.find(a => track.mbid === a.strMusicBrainzID)
		} else if (track.lastfm?.mbid) {
			audiodbTrack = audiodbTracks.track.find(a => track.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbTrack) {
			// TODO: use string distance?
			log("warn", "409", "audiodb", `Multiple tracks found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"`)
			return
		}

		const {strGenre, ...data} = audiodbTrack
		const genres = uniqueGenres(strGenre ? [strGenre] : [])
		const imageIds = await keysAndInputToImageIds(data, ['strTrackThumb'])
		await retryable(async () => prisma.audioDbTrack.create({
			data: {
				entityId: id,
				...data,
				genres: {
					connectOrCreate: genres.map(({name, simplified}) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
				thumbId: imageIds.strTrackThumb,
			},
		}))
		socketServer.send("invalidate:track", {id})
	}
}

async function keysAndInputToImageIds<
	AllKeys extends readonly (keyof Input)[],
	Key extends AllKeys[keyof AllKeys] & string,
	Input extends {[key in Key]?: string | number | null | undefined} & {[key in Exclude<string, Key>]: unknown},
	Result extends {[key in keyof Pick<Input, Key>]: string}
>(input: Input, keys: AllKeys): Promise<Result> {
	const imageIds = await Promise.allSettled(keys.map(async (key) => {
		const url = input[key]
		if (url) {
			const {hash, path, mimetype, palette} = await fetchAndWriteImage(url as string)
			if (hash) {
				const {id} = await prisma.image.upsert({
					where: { id: hash },
					update: {},
					create: {
						id: hash as string,
						path,
						mimetype,
						palette,
					}
				})
				return [key, id] as const
			}
		}
	}))
	const fulfilled = imageIds.filter((result) => result.status === 'fulfilled') as PromiseFulfilledResult<[Key, string] | undefined>[]
	const values = fulfilled.map(({value}) => value)
	const content = values.filter(Boolean) as [Key, string][]
	return Object.fromEntries(content) as Result
}

declare global {
	// eslint-disable-next-line no-var
	var audioDb: AudioDb | null;
}

export const audioDb = globalThis.audioDb
	|| new AudioDb()

// if (env.NODE_ENV !== "production") {
	globalThis.audioDb = audioDb
// }