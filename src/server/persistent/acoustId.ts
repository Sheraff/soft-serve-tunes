import { spawn } from "node:child_process"
import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import { dirname, join, relative } from "node:path"
import { IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"
import log from "utils/logger"
import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import { notArtistName } from "server/db/createTrack"
import { socketServer } from "server/persistent/ws"
import MusicBrainz from "server/persistent/musicBrainz"

/*
 * VOCABULARY:
 * - "recording" a recording of a specific track at a specific time (ie. Track)
 * - "release group" ie. Album, which can have multiple releases (eg. clean vs explicit versions, US vs Japan versions, ...)
 */


const modulePath = dirname(new URL(import.meta.url).pathname)
const origin = process.cwd()
const fpcalc = join(relative(origin, modulePath), 'bin', 'fpcalc', `fpcalc-${process.platform}`)

type FPcalcResult = {
	fingerprint: string
	duration: number
}

function execFPcalc(file: string): Promise<FPcalcResult> {
	return new Promise((resolve, reject) => {
		// https://github.com/acoustid/chromaprint/blob/master/src/cmd/fpcalc.cpp
		const cmd = spawn(join(process.cwd(), fpcalc), [file, '-json'])

		let accuData = ''
		cmd.stdout.on('data', (data) => {
			accuData+=data
		})

		let accuErr = ''
		cmd.stderr.on('data', (data) => {
			accuErr+=data
		})

		cmd.on('close', (code) => {
			if (accuErr) {
				reject(accuErr)
			} else {
				try {
					const { duration, fingerprint } = JSON.parse(accuData)
					resolve({
						duration,
						fingerprint,
					})
				} catch (e) {
					console.log('error in execFPcalc', file)
					console.log(fpcalc)
					console.log(process.cwd())
					console.log(modulePath)
					console.log(__dirname)
					throw e
				}
			}
		})
	})
}

/*
https://github.com/acoustid/acoustid-server/blob/master/acoustid/api/errors.py
ERROR_UNKNOWN_FORMAT = 1
ERROR_MISSING_PARAMETER = 2
ERROR_INVALID_FINGERPRINT = 3
ERROR_INVALID_APIKEY = 4
ERROR_INTERNAL = 5
ERROR_INVALID_USER_APIKEY = 6
ERROR_INVALID_UUID = 7
ERROR_INVALID_DURATION = 8
ERROR_INVALID_BITRATE = 9
ERROR_INVALID_FOREIGNID = 10
ERROR_INVALID_MAX_DURATION_DIFF = 11
ERROR_NOT_ALLOWED = 12
ERROR_SERVICE_UNAVAILABLE = 13
ERROR_TOO_MANY_REQUESTS = 14
ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN = 15
ERROR_INSECURE_REQUEST = 16
ERROR_UNKNOWN_APPLICATION = 17
ERROR_FINGERPRINT_NOT_FOUND = 18
*/
const acoustiIdLookupError = z.object({
	status: z.enum(["error"]),
	error: z.object({
		code: z.number(),
		message: z.string(),
	}),
})

const acoustiIdArtistSchema = z.object({
	id: z.string(),
	name: z.string(),
	// joinphrase: z.string().optional()
})

const acoustIdReleasegroupSchema = z.object({
	type: z.string().optional(),
	secondarytypes: z.array(z.string()).optional(),
	id: z.string(),
	title: z.string(),
	artists: z.array(acoustiIdArtistSchema).optional(),
})

const acoustIdRecordingSchema = z.object({
	duration: z.number().optional(),
	releasegroups: z.array(acoustIdReleasegroupSchema).optional(),
	title: z.string().optional(),
	id: z.string(),
	artists: z.array(acoustiIdArtistSchema).optional(),
})

const acoustiIdLookupSchema = z.object({
	status: z.enum(["ok"]),
	results: z.array(z.object({
		score: z.number().min(0).max(1),
		id: z.string(),
		recordings: z.array(acoustIdRecordingSchema).optional(),
	}))
})

type Result = Omit<z.infer<typeof acoustIdRecordingSchema>, "releasegroups"> & {album?: z.infer<typeof acoustIdReleasegroupSchema>} & {score: number}
type ValidatedResult = Result & {of?: number, no?: number}
type AugmentedResult = Omit<ValidatedResult, 'artists'> 
	& {genres?: {name: string}[]}
	& {
		artists?: (Exclude<ValidatedResult['artists'], undefined>[number] & {genres?: {name: string}[]})[]
		album?: Omit<Exclude<ValidatedResult['album'], undefined>, 'artists'> & {genres?: {name: string}[]} & {artists?: (Exclude<Exclude<ValidatedResult['album'], undefined>['artists'], undefined>[number] & {genres?: {name: string}[]})[]}
	}

class AcoustId {
	static RATE_LIMIT = 350

	#queue: Queue
	#musicBrainz: MusicBrainz

	constructor() {
		this.#queue = new Queue(AcoustId.RATE_LIMIT, { wait: true })
		this.#musicBrainz = new MusicBrainz()
	}

	async identify(absolutePath: string, metadata: IAudioMetadata): Promise<AugmentedResult | null> {
		log("info", "fetch", "acoustid", `${metadata.common.title} (${absolutePath})`)
		const fingerprint = await this.#fingerprintFile(absolutePath)
		const data = await this.#identifyFingerprint(fingerprint)
		const sorted = this.#pick(data.results, metadata)
		if(!sorted?.[0]) {
			return null
		}
		const result = sorted[0]
		const augmented = await this.#musicBrainzValidation(result)
		await this.#reorderArtist(augmented, metadata)
		log("ready", "200", "acoustid", `"${augmented.title}" by ${augmented.artists?.[0]?.name} in ${augmented?.album?.title} (${absolutePath})`)
		return augmented
	}

	async #fingerprintFile(absolutePath: string) {
		return execFPcalc(absolutePath)
	}

	async #fetch(body: `?${string}`) {
		const stored = await retryable(() => prisma.acoustidStorage.findUnique({where: {id: body}}))
		if (stored) {
			try {
				return JSON.parse(stored.data)
			} catch (e) {
				console.log('error while parsing stored acoustid response', body)
				throw e
			}
		}
		const data = await this.#queue.push(() => fetch(`https://api.acoustid.org/v2/lookup${body}`))
		if (data.status !== 200) {
			if (data.status === 429) {
				// Too many requests, back-off for a second
				this.#queue.delay(1000)
			}
			throw new Error(`${data.status} - ${data.statusText}`)
		}
		const json = await data.json()
		const parsed = z.union([acoustiIdLookupError, acoustiIdLookupSchema]).parse(json)
		if (parsed.status === "error") {
			log("error", "error", "acoustid", parsed.error.message)
			throw new Error(parsed.error.message)
		}
		retryable(() => prisma.acoustidStorage.upsert({
			where: { id: body },
			update: {},
			create: {
				id: body,
				data: JSON.stringify(json),
			}
		}))
		return parsed
	}

	async #identifyFingerprint(fpCalcResult: FPcalcResult): Promise<z.infer<typeof acoustiIdLookupSchema>> {
		const searchParams = new URLSearchParams()
		searchParams.append("client", env.ACOUST_ID_API_KEY)
		searchParams.append("format", "json")
		searchParams.append("duration", Math.floor(fpCalcResult.duration).toString())
		searchParams.append("fingerprint", fpCalcResult.fingerprint)
		// recordings, recordingids, releases, releaseids, releasegroups, releasegroupids, tracks, compress, usermeta, sources
		const meta = ["recordings", "releasegroups"].join("+") // the `+` signs mustn't be url encoded
		return this.#fetch(`?${searchParams}&meta=${meta}`)
	}

	// https://musicbrainz.org/doc/Release_Group/Type
	static TYPE_PRIORITY = {
		"Album": 1,
		"EP": 2,
		"Single": 3,
		"Broadcast": 4,
		"Other": 5,
		"undefined": 6,
	}

	// https://musicbrainz.org/doc/Release_Group/Type
	static SUBTYPE_PRIORITY = {
		"Live": 1,
		"Soundtrack": 2,
		"Compilation": 3,
		"Spokenword": 4,
		"Remix": 5,
		"DJ-mix": 6,
		"Mixtape/Street": 6,
		"Demo": 6,
		"Audiobook": 7,
		"Audio drama": 7,
		"Interview": 7,
		"undefined": 9,
	}

	#getTypeValue(type: string | undefined): number {
		if (!type) return AcoustId.TYPE_PRIORITY.undefined
		if (this.#isTypeKey(type)) return AcoustId.TYPE_PRIORITY[type]
		log("warn", "warn", "acoustid", `encountered an unknown TYPE_PRIORITY ${type}`)
		return AcoustId.TYPE_PRIORITY.undefined
	}

	#isTypeKey(type: string): type is keyof typeof AcoustId.TYPE_PRIORITY {
		return AcoustId.TYPE_PRIORITY.hasOwnProperty(type)
	}
	
	#getSubTypeValue(type: string | undefined): number {
		if (!type) return AcoustId.SUBTYPE_PRIORITY.undefined
		if (this.#isSubTypeKey(type)) return AcoustId.SUBTYPE_PRIORITY[type]
		log("warn", "warn", "acoustid", `encountered an unknown SUBTYPE_PRIORITY ${type}`)
		return AcoustId.SUBTYPE_PRIORITY.undefined
	}

	#isSubTypeKey(type: string): type is keyof typeof AcoustId.SUBTYPE_PRIORITY {
		return AcoustId.SUBTYPE_PRIORITY.hasOwnProperty(type)
	}

	#pick(results: z.infer<typeof acoustiIdLookupSchema>["results"], metadata: IAudioMetadata) {
		if (results.length === 0) {
			log("warn", "404", "acoustid", `No match obtained for ${metadata.common.title}`)
			return null
		}
		const metaDuration = metadata.format.duration
		const metaName = metadata.common.title
		const metaAlbum = metadata.common.album
		const metaArtist = metadata.common.artist && !notArtistName(metadata.common.artist)
			? metadata.common.artist
			: undefined
		const metaArtists = [
			...(metadata.common.artists || []),
			...(metadata.common.albumartist || []),
		].filter((name) => !notArtistName(name))
		const maxScore = Math.max(...results.map(({score}) => score))
		if (maxScore < 0.8) {
			log("warn", "404", "acoustid", `Fingerprint confidence too low (${maxScore}) for ${metadata.common.title}`)
			console.log(results)
			return null
		}
		const mostConfidentRecordings = results
			.filter(({score, recordings}) => (score > maxScore - 0.05) && recordings)
			.flatMap(({score, recordings}) => recordings?.map((recording) => ({...recording, score}))) as (z.infer<typeof acoustIdRecordingSchema> & {score: number})[]
		const sameDurationRecordings = (metaDuration && metaDuration > 15) // short duration tracks usually don't have a lot of data from acoustid
			? mostConfidentRecordings.filter(({score, duration: d}) => {
				if (!d) return false // maybe return true if score > 0.9999
				const delta = Math.abs(metaDuration - d)
				if (delta < 3) return true
				if (score > 0.9 && delta < 5) return true
				if (score > 0.95 && delta < 7) return true
				if (score > 0.99 && delta < 10) return true
				if (score > 0.999 && delta < 20) return true
				if (score > 0.9999) return true
				return false
			})
			: mostConfidentRecordings.filter(({score}) => score > 0.9)
		// at this point, there might be a way to salvage some "non viable matches" with a single call to musicbrainz
		// https://musicbrainz.org/ws/2/recording/6c8b500f-b188-4b55-9a1f-be85377d370b?fmt=json&inc=releases+artist-credits+media
		// this would give track.name, album, artist, album.artist, track.duration, track.count, track.position
		// don't do this for score too low
		// don't do this for empty array of results
		/**
		 * fetch -  acoustid  Intentional Dweeb (/Users/Flo/Music/Empty/MEUTE/Taumel/12 Intentional Dweeb.flac)
		 * 404   -  acoustid  Musicbrainz fingerprint matches don't match file duration: 224.8593537414966 vs []
		 * [ { id: 'b5726e26-6241-4bf5-904d-22c6dcdeecb5', score: 1 } ]
		 */
		if (sameDurationRecordings.length === 0) {
			log("warn", "404", "acoustid", `Musicbrainz fingerprint matches don't match file duration: ${metaDuration} vs [${mostConfidentRecordings.map(({duration}) => duration).join(', ')}]`)
			console.log(mostConfidentRecordings)
			return null
		}
		const albums = sameDurationRecordings.flatMap((recording) => {
			const {releasegroups, ...rest} = recording
			if (!releasegroups || releasegroups.length === 0) {
				return rest
			}
			return releasegroups.map((album) => ({...rest, album}))
		}) as Result[]
		albums.sort((a, b) => {
			// prefer items w/ album info
			const aAlbum = a.album
			const bAlbum = b.album
			if (aAlbum && !bAlbum) return -1
			if (!aAlbum && bAlbum) return 1
			if (!aAlbum && !bAlbum) return 0
			const _aAlbum = aAlbum as Exclude<typeof aAlbum, undefined>
			const _bAlbum = bAlbum as Exclude<typeof bAlbum, undefined>

			// prefer items w/ artist info
			const aArtists = a.artists
			const bArtists = b.artists
			if (aArtists && !bArtists) return -1
			if (!aArtists && bArtists) return 1
			if (!aArtists && !bArtists) return 0
			const _aArtists = aArtists as Exclude<typeof aArtists, undefined>
			const _bArtists = bArtists as Exclude<typeof bArtists, undefined>

			// prefer tracks w/ a title that matches file metadata
			if (metaName && a.title && b.title) { // `.title` will always be defined
				const aIsSimilarTrack = similarStrings(metaName, a.title)
				const bIsSimilarTrack = similarStrings(metaName, b.title)
				if (aIsSimilarTrack && !bIsSimilarTrack) return -1
				if (!aIsSimilarTrack && bIsSimilarTrack) return 1
			}

			// prefer tracks w/ an artist that matches file metadata
			if (metaArtist && _aArtists && _bArtists) {
				const aHasSimilarArtist = _aArtists.some(({name}) => similarStrings(metaArtist, name))
				const bHasSimilarArtist = _bArtists.some(({name}) => similarStrings(metaArtist, name))
				if (aHasSimilarArtist && !bHasSimilarArtist) return -1
				if (!aHasSimilarArtist && bHasSimilarArtist) return 1
			}
			if (metaArtists.length && _aArtists && _bArtists) {
				const aHasSimilarArtist = _aArtists.some(({name}) => metaArtists.some((meta) => similarStrings(meta, name)))
				const bHasSimilarArtist = _bArtists.some(({name}) => metaArtists.some((meta) => similarStrings(meta, name)))
				if (aHasSimilarArtist && !bHasSimilarArtist) return -1
				if (!aHasSimilarArtist && bHasSimilarArtist) return 1
			}

			// prefer albums w/ a title that matches file metadata
			if (metaAlbum && _aAlbum.title && _bAlbum.title) {
				const aIsSimilarAlbum = similarStrings(metaAlbum, _aAlbum.title)
				const bIsSimilarAlbum = similarStrings(metaAlbum, _bAlbum.title)
				if (aIsSimilarAlbum && !bIsSimilarAlbum) return -1
				if (!aIsSimilarAlbum && bIsSimilarAlbum) return 1
			}

			// sort by increasing album.type score
			if (_aAlbum.type && !_bAlbum.type) return -1
			if (!_aAlbum.type && _bAlbum.type) return 1
			if (_aAlbum.type !== _bAlbum.type) {
				const aScore = this.#getTypeValue(_aAlbum.type)
				const bScore = this.#getTypeValue(_bAlbum.type)
				return aScore - bScore
			}

			// sort by increasing album.secondarytypes score
			const aSubTypes = _aAlbum.secondarytypes || []
			const bSubTypes = _bAlbum.secondarytypes || []
			if (aSubTypes.length !== 0 || bSubTypes.length !== 0) {
				if (aSubTypes.length !== bSubTypes.length) return aSubTypes.length - bSubTypes.length
				const aSubTypesScore = aSubTypes.reduce((sum, type) => sum + this.#getSubTypeValue(type), 0)
				const bSubTypesScore = bSubTypes.reduce((sum, type) => sum + this.#getSubTypeValue(type), 0)
				if (aSubTypesScore !== bSubTypesScore) {
					return aSubTypesScore - bSubTypesScore
				}
			}

			// avoid "non artists" if confident enough
			// if neither album is a "Compilation", prefer the one with an actual artist name
			if (!aSubTypes.includes("Compilation") && !bSubTypes.includes("Compilation") && _aAlbum.artists?.[0] && _bAlbum.artists?.[0]) {
				const aNotArtist = notArtistName(_aAlbum.artists[0].name)
				const bNotArtist = notArtistName(_bAlbum.artists[0].name)
				if (!aNotArtist && bNotArtist) return -1
				if (aNotArtist && !bNotArtist) return 1
			}

			return 0
		})
		socketServer.send("global:message", {message: albums})
		return albums
	}

	// run all names through MusicBrainz to avoid getting ≠ aliases for the same entity
	async #musicBrainzValidation(result: AugmentedResult): Promise<AugmentedResult> {
		{
			const {title, releases, genres} = await this.#musicBrainz.fetch('recording', result.id)
			result.title = title
			const positions = releases.map(({media}) => media[0]!.tracks[0]!.position)
			const trackCounts = releases.map(({media}) => media[0]!["track-count"])
			if (positions.length && positions.every(value => value === positions[0]))
				result.no = positions[0]
			if (trackCounts.length && trackCounts.every(value => value === trackCounts[0]))
				result.of = trackCounts[0]
			result.genres = genres
		}
		if (result.album?.id) {
			const {title, genres} = await this.#musicBrainz.fetch('release-group', result.album.id)
			if (title)
				result.album!.title = title
			result.album!.genres = genres
		}
		if (result.artists) {
			for (const artist of result.artists) {
				const {name, genres} = await this.#musicBrainz.fetch('artist', artist.id)
				if (name)
					artist.name = name
				artist.genres = genres
			}
		}
		if (result.album?.artists?.[0]?.id) {
			const {name, genres} = await this.#musicBrainz.fetch('artist', result.album.artists[0].id)
			if (name)
				result.album!.artists![0]!.name = name
			result.album!.artists![0]!.genres = genres
		}
		return result
	}

	// handle cases where there is a single track whose main artist is not that of the rest of the album
	async #reorderArtist(result: Omit<z.infer<typeof acoustIdRecordingSchema>, "releasegroups"> & {album?: z.infer<typeof acoustIdReleasegroupSchema>} & {score: number}, metadata: IAudioMetadata) {
		if (!result.artists || result.artists.length <= 1) {
			return
		}
		const fingerprintArtist = result.album?.artists?.length === 1 && !notArtistName(result.album.artists[0]!.id)
			? result.album.artists[0]!.id
			: undefined
		if (fingerprintArtist) {
			const index = result.artists.findIndex(({id}) => id === fingerprintArtist)
			if (index <= 0) return
			const [main] = result.artists.splice(index, 1)
			result.artists.unshift(main!)
			return
		}
		const metaArtist = metadata.common.artist && !notArtistName(metadata.common.artist)
			? metadata.common.artist
			: undefined
		if (metaArtist) {
			const index = result.artists.findIndex(({name}) => similarStrings(name, metaArtist))
			if (index <= 0) return
			const [main] = result.artists.splice(index, 1)
			result.artists.unshift(main!)
			return
		}
	}
}


declare global {
	// eslint-disable-next-line no-var
	var acoustId: AcoustId | null;
}

export const acoustId = globalThis.acoustId
	|| new AcoustId()

globalThis.acoustId = acoustId
