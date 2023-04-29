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
	aliases: z.array(z.object({
		primary: z.boolean().nullable(),
		name: z.string(),
		locale: z.string().nullable(),
		type: z.enum(["Artist name", "Legal name", "Search hint"]).nullable(),
	})).optional(),
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
	async #makeRequest (url: string): Promise<unknown> {
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

	async fetch<T extends keyof typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS> (type: T, id: string): Promise<undefined | z.infer<typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[T]>> {
		const url = `https://musicbrainz.org/ws/2/${type}/${id}`
		const params = new URLSearchParams()
		if (type === "recording") {
			params.set("inc", "releases+media+genres+artist-credits+release-groups+aliases")
		} else if (type === "release-group") {
			params.set("inc", "genres")
		} else if (type === "artist") {
			params.set("inc", "genres+aliases")
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

	preferredArtistName (artist: z.infer<typeof musicBrainzArtistSchema>): string {
		if (!artist.aliases) {
			return artist.name
		}
		const primaryAliases = artist.aliases.filter(alias => alias.primary)
		if (primaryAliases.length === 0) {
			return artist.name
		}
		if (primaryAliases.length === 1) {
			return primaryAliases[0]!.name
		}
		const artistAliases = primaryAliases.filter(alias => alias.type === "Artist name")
		if (artistAliases.length === 0) {
			return artist.name
		}
		if (artistAliases.length === 1) {
			return artistAliases[0]!.name
		}
		const englishAliases = artistAliases.filter(alias => alias.locale === "en")
		if (englishAliases.length === 1) {
			return englishAliases[0]!.name
		}
		if (englishAliases.length > 1) {
			return artist.name
		}
		const frenchAliases = artistAliases.filter(alias => alias.locale === "fr")
		if (frenchAliases.length === 1) {
			return frenchAliases[0]!.name
		}
		if (frenchAliases.length > 1) {
			return artist.name
		}
		const latinAliases = artistAliases.filter(alias => alias.locale && LATIN_ALPHABET_LOCALES.has(alias.locale))
		if (latinAliases.length === 0) {
			return artist.name
		}
		if (latinAliases.length === 1) {
			return latinAliases[0]!.name
		}
		const sortedByLocale = latinAliases.sort((a, b) => {
			const aLocale = LATIN_ALPHABET_LOCALES.get(a.locale!)!
			const bLocale = LATIN_ALPHABET_LOCALES.get(b.locale!)!
			return aLocale - bLocale
		})
		return sortedByLocale[0]!.name
	}
}

const LATIN_ALPHABET_LOCALES = new Map([
	["en", 0],
	["fr", 1],
	["de", 2],
	["es", 3],
	["it", 4],
	["pt", 5],
	["nl", 6],
	["sv", 7],
	["da", 8],
	["no", 9],
	["fi", 10],
	["is", 11],
	["hu", 12],
	["pl", 13],
	["cs", 14],
	["sk", 15],
	["sl", 16],
	["hr", 17],
	["ro", 18],
	["tr", 19],
	["lt", 20],
	["lv", 21],
	["et", 22],
	["el", 23],
	["bg", 24],
	["ru", 25],
	["uk", 26],
	["be", 27],
	["sr", 28],
	["mk", 29],
	["sq", 30],
	["hy", 31],
	["ka", 32],
	["he", 33],
	["ar", 34],
	["fa", 35],
	["ur", 36],
	["hi", 37],
	["bn", 38],
	["pa", 39],
	["gu", 40],
	["ta", 41],
	["te", 42],
	["kn", 43],
	["ml", 44],
	["si", 45],
	["th", 46],
	["lo", 47],
	["my", 48],
	["ka", 49],
	["ja", 50],
	["zh", 51],
	["ko", 52],
	["vi", 53],
	["id", 54],
	["ms", 55],
	["fil", 56],
	["jv", 57],
])