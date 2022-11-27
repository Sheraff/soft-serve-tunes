import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import log from "utils/logger"

// https://musicbrainz.org/doc/MusicBrainz_API#inc.3D

const musicBrainzErrorSchema = z.object({
	error: z.string(),
	help: z.string(),
})

const musicBrainzGenreSchema = z.object({
	name: z.string()
})

const musicBrainzReleaseGroupSchema = z.object({
	id: z.string(),
	title: z.string(),
	genres: z.array(musicBrainzGenreSchema),
})

const musicBrainzArtistSchema = z.object({
	id: z.string(),
	name: z.string(),
	genres: z.array(musicBrainzGenreSchema).optional(),
})

const musicBrainzRecordingSchema = z.object({
	id: z.string(),
	title: z.string(),
	length: z.union([z.number(), z.null()]),
	releases: z.array(z.object({
		media: z.array(z.object({
			tracks: z.array(z.object({
				position: z.number()
			})).length(1),
			"track-count": z.number(),
		})).length(1),
		"release-group": z.object({
			id: z.string(),
			title: z.string(),
			"primary-type": z.union([z.string(), z.null()]),
			"secondary-types": z.array(z.string()),
			"artist-credit": z.array(z.object({
				artist: musicBrainzArtistSchema,
			})),
		}),
	})),
	"artist-credit": z.array(z.object({
		artist: musicBrainzArtistSchema,
	})),
	genres: z.array(musicBrainzGenreSchema),
})

export default class MusicBrainz {
	static RATE_LIMIT = 1000

	#queue: Queue

	constructor() {
		this.#queue = new Queue(MusicBrainz.RATE_LIMIT, { wait: true })
	}

	static MUSIC_BRAINZ_TYPED_SCHEMAS = {
		"release-group": musicBrainzReleaseGroupSchema,
		"artist": musicBrainzArtistSchema,
		"recording": musicBrainzRecordingSchema,
	} as const

	static MAX_STORED_REQUESTS = 50
	static PURGE_DELAY = 30_000
	#pastRequests: string[] = []
	#pastResponses: Map<string, unknown> = new Map()
	#purgeStoreTimeout: NodeJS.Timeout | null = null
	async #makeRequest(url: string): Promise<unknown> {
		const cached = this.#pastResponses.get(url)
		if (cached) {
			return cached
		}

		const response = await this.#queue.push(() => fetch(url, {
			headers: new Headers({
				"User-Agent": env.MUSIC_BRAINZ_USER_AGENT,
				"Accept": "application/json"
			})
		}))
		if (response.status !== 200) {
			if (response.status === 404) {
				return undefined
			}
			if (response.status === 503) {
				// Too many requests, back-off for a second
				this.#queue.delay(2_000)
				return this.#makeRequest(url)
			}
			throw new Error(`MusicBrainz error: ${response.status} - ${response.statusText}`)
		}
		const json = await response.json()
		this.#pastRequests.push(url)
		this.#pastResponses.set(url, json)

		if (this.#pastRequests.length > MusicBrainz.MAX_STORED_REQUESTS) {
			const key = this.#pastRequests.shift()!
			this.#pastResponses.delete(key)
		}
		if (this.#purgeStoreTimeout) {
			clearTimeout(this.#purgeStoreTimeout)
		}
		this.#purgeStoreTimeout = setTimeout(() => {
			this.#pastRequests = []
			this.#pastResponses = new Map()
		}, MusicBrainz.PURGE_DELAY)

		return json as unknown
	}

	async fetch<T extends keyof typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS>(type: T, id: string): Promise<undefined | z.infer<typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[T]>> {
		const url = `https://musicbrainz.org/ws/2/${type}/${id}`
		const params = new URLSearchParams()
		if (type === 'recording') {
			params.set('inc', 'releases+media+genres+artist-credits+release-groups')
		} else {
			params.set('inc', 'genres')
		}
		const json = await this.#makeRequest(`${url}?${params}`)
		if (typeof json === "undefined") {
			return undefined
		}
		const schema = z.union([
			musicBrainzErrorSchema,
			MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[type]
		])
		const parsed = schema.parse(json)
		if ("error" in parsed) {
			log("error", "500", "acoustid", `${url}: ${parsed.error}`)
			throw new Error(`MusicBrainz error: ${parsed.error}`)
		} else {
			return parsed as z.infer<typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[typeof type]>
		}
	}
}