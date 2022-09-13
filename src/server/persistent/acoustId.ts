import { exec } from "node:child_process"
import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import { dirname, join, relative } from "node:path"
import { IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"
import log from "utils/logger"

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
		exec(`${fpcalc} ${file} -json`, (err, stdout) => {
			if (err) {
				reject(err)
			}
			const { duration, fingerprint } = JSON.parse(stdout)
			resolve({
				duration,
				fingerprint,
			})
		})
	})
}

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
	joinphrase: z.string().optional()
})

const acoustIdReleasegroupSchema = z.object({
	type: z.enum(["Album", "Single", "EP", "Other"]),
	secondarytypes: z.array(z.enum(["Compilation", "Soundtrack", "Live", "Remix", "DJ-mix"])).optional(),
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

class AcoustId {
	static RATE_LIMIT = 500
	static STORAGE_LIMIT = 100

	#queue: Queue

	constructor() {
		this.#queue = new Queue(AcoustId.RATE_LIMIT, { wait: true })
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

	async identify(absolutePath: string, metadata: IAudioMetadata) {
		const fingerprint = await this.#fingerprintFile(absolutePath)
		const data = await this.#identifyFingerprint(fingerprint)
		const sorted = this.#pick(data.results, metadata)
		return sorted?.[0] ? sorted[0] : null
	}

	async #fingerprintFile(absolutePath: string) {
		return execFPcalc(absolutePath)
	}

	async #identifyFingerprint(fpCalcResult: FPcalcResult): Promise<z.infer<typeof acoustiIdLookupSchema>> {
		const url = new URL("/v2/lookup", "https://api.acoustid.org")
		url.searchParams.append("client", env.ACOUST_ID_API_KEY)
		url.searchParams.append("format", "json")
		url.searchParams.append("duration", Math.floor(fpCalcResult.duration).toString())
		url.searchParams.append("fingerprint", fpCalcResult.fingerprint)
		// recordings, recordingids, releases, releaseids, releasegroups, releasegroupids, tracks, compress, usermeta, sources
		const meta = ["recordings", "releasegroups", "compress"].join("+") // the `+` signs mustn't be url encoded
		const string = `${url}&meta=${meta}`
		if (this.#pastResponses.has(string)) {
			return this.#pastResponses.get(string)
		}
		// TODO: switch to POST requests
		const data = await this.#queue.push(() => fetch(string))
		const json = await data.json()
		const parsed = z.union([acoustiIdLookupError, acoustiIdLookupSchema]).parse(json)
		if (parsed.status === "error") {
			log("error", "error", "acoustid", parsed.error.message)
			throw new Error(parsed.error.message)
		}
		this.#pastResponses.set(string, json)
		this.#pastRequests.push(string)
		if (this.#pastRequests.length > AcoustId.STORAGE_LIMIT) {
			const pastString = this.#pastRequests.shift() as string
			this.#pastResponses.delete(pastString)
		}
		this.#purgeStore()
		return parsed
	}

	static TYPE_PRIORITY = {
		"Album": 0,
		"EP": 1,
		"Single": 2,
		"Other": 3,
	}

	static SUBTYPE_PRIORITY = {
		"Live": 1,
		"Soundtrack": 2,
		"Compilation": 3,
		"Remix": 4,
		"DJ-mix": 5,
	}

	#pick(results: z.infer<typeof acoustiIdLookupSchema>["results"], metadata: IAudioMetadata) {
		if (results.length === 0) {
			log("warn", "404", "acoustid", `No match obtained for ${metadata.common.title}`)
			return null
		}
		const metaDuration = metadata.format.duration
		const metaName = metadata.common.title
		const metaAlbum = metadata.common.album
		const maxScore = Math.max(...results.map(({score}) => score))
		if (maxScore < 0.8) {
			log("warn", "404", "acoustid", `Fingerprint confidence too low (${maxScore}) for ${metadata.common.title}`)
			return null
		}
		const mostConfidentRecordings = results
			.filter(({score, recordings}) => score === maxScore && recordings)
			.flatMap(({recordings}) => recordings) as z.infer<typeof acoustIdRecordingSchema>[]
		const sameDurationRecordings = metaDuration
			? mostConfidentRecordings.filter(({title, duration: d}) => title && d && Math.abs(metaDuration - d) < 4)
			: mostConfidentRecordings.filter(({title}) => title)
		if (sameDurationRecordings.length === 0) {
			log("warn", "404", "acoustid", `Musicbrainz fingerprint matches don't match file duration: ${metaDuration} vs [${mostConfidentRecordings.map(({duration}) => duration).join(', ')}]`)
			return null
		}
		const albums = sameDurationRecordings.flatMap((recording) => {
			const {releasegroups, ...rest} = recording
			if(!releasegroups || releasegroups.length === 0) {
				return rest
			}
			return releasegroups.map((album) => ({...rest, album}))
		}) as (Omit<z.infer<typeof acoustIdRecordingSchema>, "releasegroups"> & {album?: z.infer<typeof acoustIdReleasegroupSchema>})[]
		albums.sort((a, b) => {
			// prefer items w/ more info
			const aAlbum = a.album
			const bAlbum = b.album
			if (aAlbum && !bAlbum) return -1
			if (!aAlbum && bAlbum) return 1
			if (!aAlbum && !bAlbum) return 0

			// prefer tracks w/ a title that matches file metadata
			if (metaName && a.title && b.title) { // `.title` will always be defined
				const aIsSimilarTrack = similarStrings(metaName, a.title)
				const bIsSimilarTrack = similarStrings(metaName, b.title)
				if (aIsSimilarTrack && !bIsSimilarTrack) return -1
				if (!aIsSimilarTrack && bIsSimilarTrack) return 1
			}

			const _aAlbum = aAlbum as Exclude<typeof aAlbum, undefined>
			const _bAlbum = bAlbum as Exclude<typeof bAlbum, undefined>

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
				return AcoustId.TYPE_PRIORITY[_aAlbum.type] - AcoustId.TYPE_PRIORITY[_bAlbum.type]
			}

			// sort by increasing album.secondarytypes score
			const aSubTypes = _aAlbum.secondarytypes || []
			const bSubTypes = _bAlbum.secondarytypes || []
			if (aSubTypes.length === 0 && bSubTypes.length === 0) return 0
			if (aSubTypes.length !== bSubTypes.length) return aSubTypes.length - bSubTypes.length
			const aSubTypesScore = aSubTypes.reduce((sum, type) => sum + AcoustId.SUBTYPE_PRIORITY[type], 0)
			const bSubTypesScore = bSubTypes.reduce((sum, type) => sum + AcoustId.SUBTYPE_PRIORITY[type], 0)
			if (aSubTypesScore !== bSubTypesScore) {
				return aSubTypesScore - bSubTypesScore
			}

			return 0
		})
		return albums
	}
}


declare global {
	// eslint-disable-next-line no-var
	var acoustId: AcoustId | null;
}

export const acoustId = globalThis.acoustId
	|| new AcoustId()

globalThis.acoustId = acoustId
