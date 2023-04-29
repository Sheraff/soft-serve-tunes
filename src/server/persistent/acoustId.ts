import { spawn } from "node:child_process"
import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import { dirname, join, relative } from "node:path"
import { IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"
import log from "utils/logger"
import { notArtistName } from "server/db/createTrack"
import MusicBrainz from "server/persistent/musicBrainz"
import { simplifiedName } from "utils/sanitizeString"
import { socketServer } from "utils/typedWs/server"
import { prisma } from "server/db/client"

/*
 * VOCABULARY:
 * - "recording" a recording of a specific track at a specific time (ie. Track)
 * - "release group" ie. Album, which can have multiple releases (eg. clean vs explicit versions, US vs Japan versions, ...)
 */


const modulePath = dirname(new URL(import.meta.url).pathname)
const origin = process.cwd()
const fpcalc = join(relative(origin, modulePath), "bin", "fpcalc", `fpcalc-${process.platform}`)

type FPcalcResult = {
	fingerprint: string
	duration: number
}

function execFPcalc (file: string): Promise<FPcalcResult> {
	return new Promise((resolve, reject) => {
		// https://github.com/acoustid/chromaprint/blob/master/src/cmd/fpcalc.cpp
		const cmd = spawn(join(process.cwd(), fpcalc), [file, "-json"])

		let accuData = ""
		cmd.stdout.on("data", (data) => {
			accuData += data
		})

		let accuErr = ""
		cmd.stderr.on("data", (data) => {
			accuErr += data
		})

		cmd.on("close", (code) => {
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
					console.log("error in execFPcalc", file)
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
		id: z.string(), // this is an acoustid id, not a musicbrainz id like the other ones
		recordings: z.array(acoustIdRecordingSchema).optional(),
	}))
})

type Locale = {
	language: string
	script: string
}

type Candidate = z.infer<typeof acoustIdRecordingSchema> & {
	score: number
	releasegroups?: (Exclude<z.infer<typeof acoustIdRecordingSchema>["releasegroups"], undefined>[number] & {
		locale?: Locale
	})[]
}
type Result = Omit<Candidate, "releasegroups"> & { album?: z.infer<typeof acoustIdReleasegroupSchema> & { locale?: Locale } }
type ValidatedResult = Result & { of?: number, no?: number }
type AugmentedResult = Omit<ValidatedResult, "artists">
	& { genres?: { name: string }[] }
	& {
		artists?: (Exclude<ValidatedResult["artists"], undefined>[number] & { genres?: { name: string }[] })[]
		album?: Omit<Exclude<ValidatedResult["album"], undefined>, "artists"> & { genres?: { name: string }[] } & { artists?: (Exclude<Exclude<ValidatedResult["album"], undefined>["artists"], undefined>[number] & { genres?: { name: string }[] })[] }
	}

class AcoustId {
	static RATE_LIMIT = 350

	#queue: Queue
	#musicBrainz: MusicBrainz

	constructor() {
		this.#queue = new Queue(AcoustId.RATE_LIMIT, { wait: true })
		this.#musicBrainz = new MusicBrainz()
	}

	async identify (absolutePath: string, metadata: Pick<IAudioMetadata, "common" | "format">): Promise<AugmentedResult | null> {
		log("info", "fetch", "acoustid", `${metadata.common.title} (${absolutePath})`)
		const fingerprint = await this.#fingerprintFile(absolutePath)
		const data = await this.#identifyFingerprint(fingerprint)
		const sorted = await this.#pick(data.results, metadata)
		if (!sorted?.[0]) {
			return null
		}
		const result = sorted[0]
		const augmented = await this.#musicBrainzValidation(result)
		await this.#reorderArtist(augmented, metadata)
		log("ready", "200", "acoustid", `"${augmented.title}" by ${augmented.artists?.[0]?.name} in ${augmented?.album?.title} (${absolutePath})`)
		return augmented
	}

	async #fingerprintFile (absolutePath: string) {
		return execFPcalc(absolutePath)
	}

	async #fetch (body: `?${string}`) {
		const stored = await prisma.acoustidStorage.findFirst({ where: { search: body } })
		if (stored) {
			try {
				const data = JSON.parse(stored.result) as z.infer<typeof acoustiIdLookupSchema>
				log("info", "skip", "acoustid", `using cached result (id: ${stored.id})`)
				return data
			} catch (e) {
				log("error", "error", "acoustid", `error parsing existing result (id: ${stored.id})`)
				console.error(e)
			}
		}
		const data = await this.#queue.push(() => fetch(`https://api.acoustid.org/v2/lookup${body}`))
		if (data.status !== 200) {
			if (data.status === 429) {
				// Too many requests, back-off for a second
				this.#queue.delay(1_000)
			} else if (data.status === 504 || data.status === 500) {
				// Gateway timeout or internal server error, back-off for 10 seconds
				this.#queue.delay(10_000)
			}
			throw new Error(`${data.status} - ${data.statusText}`)
		}
		const json = await data.json()
		const parsed = z.union([acoustiIdLookupError, acoustiIdLookupSchema]).parse(json)
		if (parsed.status === "error") {
			log("error", "error", "acoustid", parsed.error.message)
			throw new Error(parsed.error.message)
		}

		if (stored) {
			prisma.acoustidStorage.update({
				where: { id: stored.id },
				data: {
					result: JSON.stringify(json),
				},
			})
		} else {
			prisma.acoustidStorage.create({
				data: {
					search: body,
					result: JSON.stringify(json),
				}
			})
		}

		return parsed
	}

	async #identifyFingerprint (fpCalcResult: FPcalcResult): Promise<z.infer<typeof acoustiIdLookupSchema>> {
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

	#getTypeValue (type: string | undefined): number {
		if (!type) return AcoustId.TYPE_PRIORITY.undefined
		if (this.#isTypeKey(type)) return AcoustId.TYPE_PRIORITY[type]
		log("warn", "warn", "acoustid", `encountered an unknown TYPE_PRIORITY ${type}`)
		return AcoustId.TYPE_PRIORITY.undefined
	}

	#isTypeKey (type: string): type is keyof typeof AcoustId.TYPE_PRIORITY {
		return AcoustId.TYPE_PRIORITY.hasOwnProperty(type)
	}

	#getSubTypeValue (type: string | undefined): number {
		if (!type) return AcoustId.SUBTYPE_PRIORITY.undefined
		if (this.#isSubTypeKey(type)) return AcoustId.SUBTYPE_PRIORITY[type]
		log("warn", "warn", "acoustid", `encountered an unknown SUBTYPE_PRIORITY ${type}`)
		return AcoustId.SUBTYPE_PRIORITY.undefined
	}

	#isSubTypeKey (type: string): type is keyof typeof AcoustId.SUBTYPE_PRIORITY {
		return AcoustId.SUBTYPE_PRIORITY.hasOwnProperty(type)
	}

	async #pick (results: z.infer<typeof acoustiIdLookupSchema>["results"], metadata: Pick<IAudioMetadata, "common" | "format">) {
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
		const maxScore = Math.max(...results.map(({ score }) => score))
		if (maxScore < 0.8) {
			log("warn", "404", "acoustid", `Fingerprint confidence too low (${maxScore}) for ${metaName}`)
			console.log(results)
			return null
		}
		const candidates = results
			.filter(({ score, recordings }) => (score > maxScore - 0.05) && recordings)
			.flatMap(({ score, recordings }) => recordings?.map((recording) => ({ ...recording, score }))) as Candidate[]

		if (candidates.length === 0) {
			log("warn", "404", "acoustid", `Fingerprint did not retrieve enough data for ${metaName}`)
			return null
		}
		/*
		 * Fix the top results that need fixing.
		 * This will allow us to still have useful data for results that look like:
		 * { id: '89022cad-fc08-439e-b07a-c5319d230999', score: 0.940533 }
		 * 
		 * The request made to musicbrainz for this step is the same we would have done
		 * anyway at the musicBrainzValidation step, and it is cached so it won't be re-fired.
		 * However, here, we do it for more than a single result, which is why we only do it
		 * for a few of the top results.
		 */
		const confidentCandidates = candidates.sort((a, b) => b.score - a.score)
		for (let i = 0; i < Math.min(2, confidentCandidates.length); i++) {
			const candidate = confidentCandidates[i]
			if (!candidate) continue
			if (candidate.score <= 0.9) continue
			if (!candidate.title || !candidate.artists || !candidate.releasegroups || !candidate.duration) {
				confidentCandidates[i] = await this.#musicBrainzComplete(candidate)
			}
		}
		const sameDurationRecordings = (metaDuration && metaDuration > 15) // short duration tracks usually don't have a lot of data from acoustid
			? confidentCandidates.filter((candidate) => {
				if (candidate.score > 0.9999) return true
				/**
				 * Some results are correct in everything but the duration, and we don't really
				 * use the duration data anyway, it's just a proxy for accuracy of results.
				 * So we first test whether *everything* is correct, before falling back to
				 * checking against duration
				 */
				if (
					candidate.score > 0.9
					&& candidate.title && metaName && simplifiedName(candidate.title) === simplifiedName(metaName)
					&& candidate.artists && metaArtist && candidate.artists.some(artist => simplifiedName(artist.name) === simplifiedName(metaArtist))
					&& candidate.releasegroups && metaAlbum && candidate.releasegroups.some(album => simplifiedName(album.title) === simplifiedName(metaAlbum))
				) {
					return true
				}
				if (!candidate.duration) {
					return false
				}
				/**
				 * Duration seems to be a good proxy for accuracy of results
				 * so the closed to the original duration the result is, the lower
				 * the confidence score needs to be to be considered a match
				 */
				const delta = Math.abs(metaDuration - candidate.duration)
				if (delta < 3) return true
				if (candidate.score > 0.9 && delta < 5) return true
				if (candidate.score > 0.95 && delta < 7) return true
				if (candidate.score > 0.99 && delta < 10) return true
				if (candidate.score > 0.999 && delta < 20) return true
				return false
			})
			: confidentCandidates.filter(({ score }) => score > 0.9)

		if (sameDurationRecordings.length === 0) {
			log("warn", "404", "acoustid", `Musicbrainz fingerprint matches don't fit file metadata for ${metaName}`)
			confidentCandidates.forEach(candidate => (
				console.log({
					...candidate,
					releasegroups: candidate.releasegroups?.map(({ title }) => title).join(" --- "),
					artists: candidate.artists?.map(({ name }) => name).join(" --- ")
				})
			))
			return null
		}
		const albums = sameDurationRecordings.flatMap((recording) => {
			const { releasegroups, ...rest } = recording
			if (!releasegroups || releasegroups.length === 0) {
				return rest
			}
			return releasegroups.map((album) => ({ ...rest, album }))
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
				const aHasSimilarArtist = _aArtists.some(({ name }) => similarStrings(metaArtist, name))
				const bHasSimilarArtist = _bArtists.some(({ name }) => similarStrings(metaArtist, name))
				if (aHasSimilarArtist && !bHasSimilarArtist) return -1
				if (!aHasSimilarArtist && bHasSimilarArtist) return 1
			}
			if (metaArtists.length && _aArtists && _bArtists) {
				const aHasSimilarArtist = _aArtists.some(({ name }) => metaArtists.some((meta) => similarStrings(meta, name)))
				const bHasSimilarArtist = _bArtists.some(({ name }) => metaArtists.some((meta) => similarStrings(meta, name)))
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

			// prefer english titles (or latin script titles)
			const aLocale = a.album?.locale
			const bLocale = b.album?.locale
			if (aLocale && bLocale) {
				if (aLocale.language !== bLocale.language) {
					if (aLocale.language === "en" && bLocale.language !== "en") return -1
					if (aLocale.language !== "en" && bLocale.language === "en") return 1
				} else if (aLocale.language === "mul") {
					if (aLocale.script !== bLocale.script) {
						if (aLocale.script === "Latn" && bLocale.script !== "Latn") return -1
						if (aLocale.script !== "Latn" && bLocale.script === "Latn") return 1
					}
				}
			}

			return 0
		})
		socketServer.emit("console", { message: albums })
		return albums
	}

	async #musicBrainzComplete (result: Candidate): Promise<Candidate> {
		const data = await this.#musicBrainz.fetch("recording", result.id)
		if (!data) return result
		result.title = data.title
		if (!result.releasegroups) {
			result.releasegroups = []
		}
		data.releases.forEach(release => {
			result.releasegroups!.unshift({
				id: release["release-group"].id,
				title: release["release-group"].title,
				artists: release["release-group"]["artist-credit"].map(({ artist }) => ({
					id: artist.id,
					name: this.#musicBrainz.preferredArtistName(artist) || artist.name,
				})),
				secondarytypes: release["release-group"]["secondary-types"],
				type: release["release-group"]["primary-type"] || undefined,
				locale: release["text-representation"],
			})
		})
		if (!result.artists) {
			result.artists = []
		}
		data["artist-credit"].forEach(credit => {
			result.artists!.unshift({
				id: credit.artist.id,
				name: this.#musicBrainz.preferredArtistName(credit.artist) || credit.artist.name,
			})
		})
		if (data.length) {
			result.duration = data.length / 1000
		}
		return result
	}

	// run all names through MusicBrainz to avoid getting ≠ aliases for the same entity
	async #musicBrainzValidation (result: AugmentedResult): Promise<AugmentedResult> {
		{
			const data = await this.#musicBrainz.fetch("recording", result.id)
			if (data) {
				const title = this.#musicBrainz.preferredTrackName(data)
				if (title) result.title = title
				const positions = data.releases.map(({ media }) => media[0]!.tracks[0]!.position)
				const trackCounts = data.releases.map(({ media }) => media[0]!["track-count"])
				if (positions.length && positions.every(value => value === positions[0]))
					result.no = positions[0]
				if (trackCounts.length && trackCounts.every(value => value === trackCounts[0]))
					result.of = trackCounts[0]
				result.genres = data.genres
			}
		}
		if (result.album?.id) {
			const data = await this.#musicBrainz.fetch("release-group", result.album.id)
			if (data) {
				const { genres } = data
				const title = this.#musicBrainz.preferredAlbumName(data)
				if (title) result.album!.title = title
				result.album!.genres = genres
			}
		}
		if (result.artists) {
			for (const artist of result.artists) {
				const data = await this.#musicBrainz.fetch("artist", artist.id)
				if (data) {
					const name = this.#musicBrainz.preferredArtistName(data)
					if (name) artist.name = name
					artist.genres = data.genres
				}
			}
		}
		if (result.album?.artists?.[0]?.id) {
			const data = await this.#musicBrainz.fetch("artist", result.album.artists[0].id)
			if (data) {
				const name = this.#musicBrainz.preferredArtistName(data)
				if (name) result.album!.artists![0]!.name = name
				result.album!.artists![0]!.genres = data.genres
			}
		}
		return result
	}

	// handle cases where there is a single track whose main artist is not that of the rest of the album
	async #reorderArtist (result: Omit<z.infer<typeof acoustIdRecordingSchema>, "releasegroups"> & { album?: z.infer<typeof acoustIdReleasegroupSchema> } & { score: number }, metadata: Pick<IAudioMetadata, "common" | "format">) {
		if (!result.artists || result.artists.length <= 1) {
			return
		}
		const fingerprintArtist = result.album?.artists?.length === 1 && !notArtistName(result.album.artists[0]!.id)
			? result.album.artists[0]!.id
			: undefined
		if (fingerprintArtist) {
			const index = result.artists.findIndex(({ id }) => id === fingerprintArtist)
			if (index <= 0) return
			const [main] = result.artists.splice(index, 1)
			result.artists.unshift(main!)
			return
		}
		const metaArtist = metadata.common.artist && !notArtistName(metadata.common.artist)
			? metadata.common.artist
			: undefined
		if (metaArtist) {
			const index = result.artists.findIndex(({ name }) => similarStrings(name, metaArtist))
			if (index <= 0) return
			const [main] = result.artists.splice(index, 1)
			result.artists.unshift(main!)
			return
		}
	}
}

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const acoustId = (globalThis.acoustId || new AcoustId()) as InstanceType<typeof AcoustId>
// @ts-expect-error -- see above
globalThis.acoustId = acoustId
