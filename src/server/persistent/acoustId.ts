import { exec } from "node:child_process"
import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import { dirname, join, relative } from "node:path"

const here = dirname(new URL(import.meta.url).pathname) // /Users/Flo/GitHub/soft-serve-tunes/src/server/persistent
const there = process.cwd()
const rel = relative(there, here)
const full = join(rel, 'bin', 'fpcalc', `fpcalc-${process.platform}`)

type FPcalcResult = {
	fingerprint: string
	duration: number
}

function execFPcalc(file: string): Promise<FPcalcResult> {
	
	__dirname // /Users/Flo/GitHub/soft-serve-tunes/.next/server/pages/api
	return new Promise((resolve, reject) => {
		// https://github.com/acoustid/chromaprint/blob/master/src/cmd/fpcalc.cpp
		exec(`${full} ${file} -json`, (err, stdout) => {
			if (err) {
				reject(err)
			}
			const { duration, fingerprint } = JSON.parse(stdout)
			resolve({
				duration: Math.floor(duration),
				fingerprint
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

const acoustiIdLookupSchema = z.object({
	status: z.enum(["ok"]),
	results: z.array(z.object({
		score: z.number().min(0).max(1),
		id: z.string(),
		recordings: z.array(z.object({
			duration: z.number().optional(),
			releasegroups: z.array(z.object({
				type: z.enum(["Album", "Single", "EP"]),
				secondarytypes: z.array(z.enum(["Compilation", "Soundtrack", "Live"])).optional(),
				id: z.string(),
				title: z.string(),
				artists: z.array(acoustiIdArtistSchema).optional(),
			})).optional(),
			title: z.string().optional(),
			id: z.string(),
			artists: z.array(acoustiIdArtistSchema).optional(),
		})).optional(),
	}))
})

class AcoustId {
	static RATE_LIMIT = 350
	static STORAGE_LIMIT = 100 // TODO: implement storage

	#queue: Queue

	constructor() {
		this.#queue = new Queue(AcoustId.RATE_LIMIT, { wait: true })
	}

	async identify(absolutePath: string) {
		const fingerprint = await this.#fingerprintFile(absolutePath)
		const data = await this.#identifyFingerprint(fingerprint)
		return data
	}

	async #fingerprintFile(absolutePath: string) {
		return execFPcalc(absolutePath)
	}

	async #identifyFingerprint(fpCalcResult: FPcalcResult) {
		const url = new URL("/v2/lookup", "https://api.acoustid.org")
		url.searchParams.append("client", env.ACOUST_ID_API_KEY)
		url.searchParams.append("format", "json")
		url.searchParams.append("duration", fpCalcResult.duration.toString())
		url.searchParams.append("fingerprint", fpCalcResult.fingerprint)
		// recordings, recordingids, releases, releaseids, releasegroups, releasegroupids, tracks, compress, usermeta, sources
		const meta = ["recordings", "releasegroups", "compress"].join("+") // the `+` signs mustn't be url encoded
		await this.#queue.next()
		const data = await fetch(`${url}&meta=${meta}`)
		const json = await data.json()
		// console.log(json)
		// console.log(json.results[0].recordings)
		const parsed = z.union([acoustiIdLookupError, acoustiIdLookupSchema]).parse(json)
		if (parsed.status === "error") {
			throw new Error(parsed.error.message)
		}
		return parsed
	}
}


declare global {
	// eslint-disable-next-line no-var
	var acoustId: AcoustId | null;
}

export const acoustId = globalThis.acoustId
	|| new AcoustId()

globalThis.acoustId = acoustId
