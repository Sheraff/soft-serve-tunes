import { env } from "env/server.mjs"
import { z } from "zod"
import { fetchAndWriteImage } from "utils/writeImage"
import Queue from "utils/Queue"
import sanitizeString, { cleanGenreList } from "utils/sanitizeString"
import log from "utils/logger"
import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import { socketServer } from "utils/typedWs/server"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"
import similarStrings from "utils/similarStrings"

const audiodbArtistSchema = z.object({
	artists:
		z.array(z.object({
			idArtist: z.string().transform(Number),
			strArtist: z.string(),
			strArtistAlternate: z.string().nullable().optional(),
			intFormedYear: z.string().optional().nullable().transform(val => val ? parseInt(val) : undefined),
			intBornYear: z.string().optional().nullable().transform(val => val ? parseInt(val) : undefined),
			strMusicBrainzID: z.string().optional().nullable(),
			strBiographyEN: z.string().optional().nullable(),
			strArtistThumb: z.string().optional().nullable(),
			strArtistLogo: z.string().optional().nullable(),
			strArtistCutout: z.string().optional().nullable(),
			strArtistClearart: z.string().optional().nullable(),
			strArtistWideThumb: z.string().optional().nullable(),
			strArtistBanner: z.string().optional().nullable(),
		}))
})

const audiodbAlbumSchema = z.object({
	album:
		z.array(z.object({
			idAlbum: z.string().transform(Number),
			idArtist: z.string().transform(Number),
			strAlbum: z.string(),
			intYearReleased: z.string().optional().nullable().transform(val => val ? parseInt(val) : undefined),
			strMusicBrainzID: z.string().optional().nullable(),
			strDescriptionEN: z.string().optional().nullable(),
			strAlbumThumb: z.string().optional().nullable(),
			strAlbumThumbHQ: z.string().optional().nullable(),
			strAlbumCDart: z.string().optional().nullable(),
			strAllMusicID: z.string().optional().nullable(),
			strBBCReviewID: z.string().optional().nullable(),
			strRateYourMusicID: z.string().optional().nullable(),
			strDiscogsID: z.string().optional().nullable(),
			strWikidataID: z.string().optional().nullable(),
			strWikipediaID: z.string().optional().nullable(),
			strGeniusID: z.string().optional().nullable(),
			strLyricWikiID: z.string().optional().nullable(),
			strMusicMozID: z.string().optional().nullable(),
			strItunesID: z.string().optional().nullable(),
			strAmazonID: z.string().optional().nullable(),
		}))
})

const audiodbTrackSchema = z.object({
	track:
		z.array(z.object({
			idTrack: z.string().transform(Number),
			idAlbum: z.string().transform(Number),
			strTrack: z.string(),
			intDuration: z.string().optional().nullable().transform(val => val ? parseInt(val) : undefined),
			strGenre: z.string().optional().nullable(),
			strTrackThumb: z.string().optional().nullable(),
			strMusicVid: z.string().optional().nullable(),
			intTrackNumber: z.string().optional().nullable().transform(val => val ? parseInt(val) : undefined),
			strMusicBrainzID: z.string().optional().nullable(),
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

	async #audiodbFetch(endpoint: keyof typeof AudioDb["ENDPOINT_SCHEMAS"], ...params: [string, string][]) {
		const url = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/${endpoint}.php`, "https://theaudiodb.com")
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
			log("error", "error", "audiodb", `Error fetching artist "${id}"`)
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
				lastfm: { select: { mbid: true } },
				audiodb: { select: { idArtist: true } }
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
				const json = await this.#audiodbFetch("artist-mb", ["i", artist.mbid])
				if (json?.artists && json.artists.length > 0) return json
			}
			if (artist.lastfm?.mbid) {
				const json = await this.#audiodbFetch("artist-mb", ["i", artist.lastfm.mbid])
				if (json?.artists && json.artists.length > 0) return json
			}
			const json = await this.#audiodbFetch("search", ["s", sanitizeString(artist.name)])
			if (json?.artists && json.artists.length > 0) return json
		})()

		if (!artistsJson) {
			log("warn", "404", "audiodb", `No artist found for "${artist.name}"`)
			return
		}

		const audiodbArtists = audiodbArtistSchema.parse(artistsJson)

		if (audiodbArtists.artists.length === 0) {
			log("warn", "404", "audiodb", `Artist found for "${artist.name}" but no artist data was received`)
			return
		}

		let audiodbArtist: typeof audiodbArtists["artists"][number] | undefined = undefined
		if (audiodbArtists.artists.length === 1) {
			audiodbArtist = audiodbArtists.artists[0]
		} else if (artist.mbid) {
			audiodbArtist = audiodbArtists.artists.find(a => artist.mbid === a.strMusicBrainzID)
		} else if (artist.lastfm?.mbid) {
			audiodbArtist = audiodbArtists.artists.find(a => artist.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbArtist) {
			log("warn", "102", "audiodb", `No exact Artist match for "${artist.name}", trying string similarity`)
			const similar = audiodbArtists.artists.filter(a => similarStrings(artist.name, a.strArtist))
			if (similar.length === 1) {
				audiodbArtist = similar[0]
			}
		}

		if (!audiodbArtist) {
			log("warn", "409", "audiodb", `Multiple artists found for "${artist.name}"`)
			return
		}

		const imageIds = await keysAndInputToImageIds(audiodbArtist, [
			"strArtistThumb",
			"strArtistLogo",
			"strArtistCutout",
			"strArtistClearart",
			"strArtistWideThumb",
			"strArtistBanner",
		])

		audiodbArtist.strArtist = audiodbArtist.strArtistAlternate && !similarStrings(artist.name, audiodbArtist.strArtist)
			? similarStrings(artist.name, audiodbArtist.strArtistAlternate)
				? audiodbArtist.strArtistAlternate
				: audiodbArtist.strArtist
			: audiodbArtist.strArtist

		delete audiodbArtist.strArtistAlternate

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
		const artistChangedCover = await computeArtistCover(id, { tracks: false, album: false })
		if (!artistChangedCover) {
			socketServer.emit("invalidate", { type: "artist", id })
		}
		log("ready", "200", "audiodb", `fetched artist ${audiodbArtist.strArtist}`)
	}

	#runningAlbums = new Set<string>()
	async fetchAlbum(id: string) {
		if (!this.#hasKey) return
		if (this.#runningAlbums.has(id)) return
		this.#runningAlbums.add(id)
		try {
			await this.#fetchAlbum(id)
		} catch (e) {
			log("error", "error", "audiodb", `Error fetching album "${id}"`)
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
				lastfm: { select: { mbid: true } },
				audiodb: { select: { idAlbum: true } },
				artist: { select: { name: true } },
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
				const json = await this.#audiodbFetch("album-mb", ["i", album.mbid])
				if (json?.album && json.album.length > 0) return json
			}
			if (album.lastfm?.mbid) {
				const json = await this.#audiodbFetch("album-mb", ["i", album.lastfm.mbid])
				if (json?.album && json.album.length > 0) return json
			}
			if (album.artist?.name) {
				const json = await this.#audiodbFetch("searchalbum", ["s", sanitizeString(album.name)], ["a", sanitizeString(album.artist.name)])
				if (json?.album && json.album.length > 0) return json
			}
		})()

		if (!albumsJson) {
			log("warn", "404", "audiodb", `No album found for "${album.name}" by "${album.artist?.name}"`)
			return
		}

		const audiodbAlbums = audiodbAlbumSchema.parse(albumsJson)

		if (audiodbAlbums.album.length === 0) {
			log("warn", "404", "audiodb", `Album found for "${album.name}" but no album data was received`)
			return
		}

		let audiodbAlbum: typeof audiodbAlbums["album"][number] | undefined = undefined
		if (audiodbAlbums.album.length === 1) {
			audiodbAlbum = audiodbAlbums.album[0]
		} else if (album.mbid) {
			audiodbAlbum = audiodbAlbums.album.find(a => album.mbid === a.strMusicBrainzID)
		} else if (album.lastfm?.mbid) {
			audiodbAlbum = audiodbAlbums.album.find(a => album.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbAlbum) {
			log("warn", "102", "audiodb", `No exact Album match for "${album.name}", trying string similarity`)
			const similar = audiodbAlbums.album.filter(a => similarStrings(album.name, a.strAlbum))
			if (similar.length === 1) {
				audiodbAlbum = similar[0]
			}
		}

		if (!audiodbAlbum) {
			log("warn", "409", "audiodb", `Multiple albums found for "${album.name}" by "${album.artist?.name}"`)
			return
		}

		const imageIds = await keysAndInputToImageIds(audiodbAlbum, [
			"strAlbumThumb",
			"strAlbumThumbHQ",
			"strAlbumCDart",
		])
		await retryable(async () => prisma.audioDbAlbum.create({
			data: {
				entityId: id,
				...audiodbAlbum!,
				thumbId: imageIds.strAlbumThumb,
				thumbHqId: imageIds.strAlbumThumbHQ,
				cdArtId: imageIds.strAlbumCDart,
			}
		}))
		const albumChangedCover = await computeAlbumCover(id, { tracks: true, artist: true })
		if (!albumChangedCover) {
			socketServer.emit("invalidate", { type: "album", id })
		}
		log("ready", "200", "audiodb", `fetched album ${audiodbAlbum.strAlbum}`)
	}

	#runningTracks = new Set<string>()
	async fetchTrack(id: string) {
		if (!this.#hasKey) return
		if (this.#runningTracks.has(id)) return
		this.#runningTracks.add(id)
		try {
			await this.#fetchTrack(id)
		} catch (e) {
			log("error", "error", "audiodb", `Error fetching track "${id}"`)
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
				lastfm: { select: { mbid: true } },
				audiodb: { select: { idTrack: true } },
				artist: { select: { name: true } },
				album: { select: { name: true } },
				position: true,
				metaPosition: true,
				spotify: { select: { trackNumber: true } },
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
				const json = await this.#audiodbFetch("track-mb", ["i", track.mbid])
				if (json?.track && json.track.length > 0) return json
			}
			if (track.lastfm?.mbid) {
				const json = await this.#audiodbFetch("track-mb", ["i", track.lastfm.mbid])
				if (json?.track && json.track.length > 0) return json
			}
			if (track.artist?.name) {
				const params = [
					["s", sanitizeString(track.artist.name)],
					["t", sanitizeString(track.name)],
				] as [string, string][]
				if (track.album?.name) {
					params.push(["a", sanitizeString(track.album.name)])
				}
				const json = await this.#audiodbFetch("searchtrack", ...params)
				if (json?.track && json.track.length > 0) return json
			}
		})()

		if (!tracksJson) {
			log("warn", "404", "audiodb", `No track found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"`)
			return
		}

		const audiodbTracks = audiodbTrackSchema.parse(tracksJson)

		if (audiodbTracks.track.length === 0) {
			log("warn", "404", "audiodb", `Track found for "${track.name}" but no track data was received`)
			return
		}

		let audiodbTrack: typeof audiodbTracks["track"][number] | undefined = undefined
		if (audiodbTracks.track.length === 1) {
			audiodbTrack = audiodbTracks.track[0]
		} else if (track.mbid) {
			audiodbTrack = audiodbTracks.track.find(a => track.mbid === a.strMusicBrainzID)
		} else if (track.lastfm?.mbid) {
			audiodbTrack = audiodbTracks.track.find(a => track.lastfm!.mbid === a.strMusicBrainzID)
		}

		if (!audiodbTrack) {
			log("warn", "102", "audiodb", `No exact Track match for "${track.name}", trying string similarity`)
			const similar = audiodbTracks.track.filter(a => similarStrings(track.name, a.strTrack))
			if (similar.length === 1) {
				audiodbTrack = similar[0]
			}
		}

		if (!audiodbTrack) {
			log("warn", "409", "audiodb", `Multiple tracks found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"`)
			return
		}

		const { strGenre, ...data } = audiodbTrack
		const existingConnection = await prisma.audioDbTrack.findUnique({
			where: { idTrack: data.idTrack },
			select: {
				entity: {
					select: {
						id: true,
						// TODO: all the info below should be removed, it's only temporary until I can debug why there are duplicate audioDbTracks
						name: true,
						artist: { select: { name: true } },
						album: { select: { name: true } },
					}
				}
			}
		})
		if (existingConnection && existingConnection.entity) {
			log("warn", "500", "audiodb",
				`AudioDb track found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"
				but another track is already associated with the data found ("${existingConnection.entity.name}" in "${existingConnection.entity.album?.name}" by "${existingConnection.entity.artist?.name}")
				Will not associate data: ${data.strTrack} idTrack#${data.idTrack}`
			)
			return
		}
		if (existingConnection) {
			try {
				await prisma.audioDbTrack.update({
					where: { idTrack: data.idTrack },
					data: { entityId: id }
				})
			} catch (e) {
				console.error(new Error(
					`audiodb track found for "${track.name}" in "${track.album?.name}" by "${track.artist?.name}"
					it already existed, so we tried to connect it to the track, but this seems to fail too (${data.strTrack} idTrack#${data.idTrack})`,
					{ cause: e }
				))
			}
			const newPosition = track.metaPosition ?? track.spotify?.trackNumber ?? data.intTrackNumber ?? null
			if (newPosition !== null && newPosition !== track.position) {
				prisma.track.update({
					where: { id },
					data: { position: newPosition }
				})
			}
			return
		}
		const genres = cleanGenreList(strGenre ? [strGenre] : [])
		const imageIds = await keysAndInputToImageIds(data, ["strTrackThumb"])
		await prisma.audioDbTrack.create({
			data: {
				entityId: id,
				...data,
				genres: {
					connectOrCreate: genres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				},
				thumbId: imageIds.strTrackThumb,
			},
		})
		const newPosition = track.metaPosition ?? track.spotify?.trackNumber ?? data.intTrackNumber ?? null
		if (newPosition !== null && newPosition !== track.position) {
			prisma.track.update({
				where: { id },
				data: { position: newPosition }
			})
		}
		const changedTrackCover = await computeTrackCover(id, { album: true, artist: true })
		if (!changedTrackCover) {
			socketServer.emit("invalidate", { type: "track", id })
		}
		log("ready", "200", "audiodb", `fetched track ${data.strTrack}`)
	}
}

async function keysAndInputToImageIds<
	AllKeys extends readonly (keyof Input)[],
	Key extends AllKeys[keyof AllKeys] & string,
	Input extends { [key in Key]?: string | number | null | undefined } & { [key in Exclude<string, Key>]: unknown },
	Result extends { [key in keyof Pick<Input, Key>]: string }
>(input: Input, keys: AllKeys): Promise<Result> {
	const imageIds = await Promise.allSettled(keys.map(async (key) => {
		const url = input[key] as string | undefined
		if (url) {
			const { hash, path, mimetype, palette, blur } = await fetchAndWriteImage(url)
			if (hash) {
				const { id } = await prisma.image.upsert({
					where: { id: hash },
					update: {},
					create: {
						id: hash as string,
						path,
						mimetype,
						palette,
						blur,
						origin: url,
					}
				})
				return [key, id] as const
			}
		}
	}))
	const fulfilled = imageIds.filter((result) => result.status === "fulfilled") as PromiseFulfilledResult<[Key, string] | undefined>[]
	const values = fulfilled.map(({ value }) => value)
	const content = values.filter(Boolean) as [Key, string][]
	return Object.fromEntries(content) as Result
}

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const audioDb = (globalThis.audioDb || new AudioDb()) as InstanceType<typeof AudioDb>
// @ts-expect-error -- see above
globalThis.audioDb = audioDb
