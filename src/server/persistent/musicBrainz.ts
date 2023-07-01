import { env } from "env/server.mjs"
import Queue from "utils/Queue"
import { z } from "zod"
import log from "utils/logger"

const zSafeDate = z
	.any()
	.optional()
	.transform((dateString) => {
		if (!dateString || typeof dateString !== 'string') return undefined
		const date = new Date(dateString)
		if (!z.date().safeParse(date).success) {
			return undefined
		}
		return date
	})

// https://musicbrainz.org/doc/MusicBrainz_API#inc.3D

const musicBrainzErrorSchema = z.object({
	error: z.string(),
	help: z.string(),
})

const musicBrainzGenreSchema = z.object({
	name: z.string()
})

const textRepresentationSchema = z.object({
	language: z.string().nullable(), // "eng" for english, "mul" for international
	script: z.string().nullable(), // "Latn" for latin
})

const musicBrainzReleaseGroupSchema = z.object({
	id: z.string(),
	title: z.string(),
	genres: z.array(musicBrainzGenreSchema),
	releases: z.array(z.object({
		["text-representation"]: textRepresentationSchema,
		date: zSafeDate,
		title: z.string(),
	})),
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
		ended: z.boolean().nullable(),
	})).optional(),
})

const musicBrainzRecordingSchema = z.object({
	id: z.string(),
	title: z.string(),
	length: z.union([z.number(), z.null()]),
	releases: z.array(z.object({
		media: z.array(z.object({
			tracks: z.array(z.object({
				position: z.number(),
				title: z.string(),
			})).length(1),
			"track-count": z.number(),
		})).length(1),
		"text-representation": textRepresentationSchema,
		"release-group": z.object({
			id: z.string(),
			title: z.string(),
			"primary-type": z.union([z.string(), z.null()]),
			"secondary-types": z.array(z.string()),
			"artist-credit": z.array(z.object({
				artist: musicBrainzArtistSchema,
			})),
			"first-release-date": zSafeDate,
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
		if (type === "recording") {
			params.set("inc", "releases+media+genres+artist-credits+release-groups+aliases")
		} else if (type === "release-group") {
			params.set("inc", "genres+releases")
		} else if (type === "artist") {
			params.set("inc", "genres+aliases")
		}
		const json = await this.#makeRequest(`${url}?${params}`)
		if (typeof json === "undefined") {
			return undefined
		}
		const schema = z.union([
			MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[type],
			musicBrainzErrorSchema,
		])
		const parsed = schema.safeParse(json)
		if (!parsed.success) {
			log("error", "500", "acoustid", `${url}: ${parsed.error}`)
			throw new Error(`MusicBrainz zod error: ${parsed.error}`)
		}
		if ("error" in parsed.data) {
			log("error", "500", "acoustid", `${url}: ${parsed.data.error}`)
			throw new Error(`MusicBrainz error: ${parsed.data.error}`)
		}
		return parsed.data as z.infer<typeof MusicBrainz.MUSIC_BRAINZ_TYPED_SCHEMAS[typeof type]>
	}

	preferredArtistName(artist: z.infer<typeof musicBrainzArtistSchema>): string {
		if (!artist.aliases) {
			return artist.name
		}

		// super confident
		const primaryAliases = artist.aliases.filter(alias => alias.primary && alias.type === "Artist name" && alias.ended !== true && alias.locale === "en")
		if (primaryAliases.length > 0) {
			return primaryAliases[0]!.name
		}

		// still acceptable current name
		const mainNameLatinCharCount = countLatinCharacters(artist.name)
		if (mainNameLatinCharCount > 2) {
			return artist.name
		}

		// all possible options remaining
		const latinAliases = artist.aliases.filter(alias =>
			countLatinCharacters(alias.name) > 0
			&& (alias.type === "Artist name" || alias.type === null)
		)
		if (latinAliases.length === 0) {
			return artist.name
		}
		const latinBest = latinAliases.filter(alias =>
			alias.primary
			&& alias.type === "Artist name"
			&& alias.ended !== true
		)
		if (latinBest.length > 0) {
			return latinBest[0]!.name
		}
		const latinSecondary = latinAliases.filter(alias => alias.ended !== true)
		if (latinSecondary.length > 0) {
			return latinSecondary[0]!.name
		}
		const latinOldNames = latinAliases.filter(alias => alias.primary)
		if (latinOldNames.length > 0) {
			return latinOldNames[0]!.name
		}
		const lastResort = latinAliases.filter(alias => alias.primary !== false && alias.type === "Artist name")
		if (lastResort.length > 0) {
			return lastResort[0]!.name
		}
		return artist.name
	}

	preferredTrackName(recording: z.infer<typeof musicBrainzRecordingSchema>): string {
		if (recording.releases.length === 0) {
			return recording.title
		}
		const releasesWithTrackTitle = recording.releases.filter(release => release.media[0]?.tracks[0]?.title)
		if (releasesWithTrackTitle.length < 2) {
			return recording.title
		}
		const latinReleases = releasesWithTrackTitle.filter(release => release["text-representation"].script === "Latn")
		if (latinReleases.length === 1) {
			return latinReleases[0]!.media[0]!.tracks[0]!.title
		}
		if (latinReleases.length === 0) {
			return recording.title
		}
		const englishReleases = latinReleases.filter(release => release["text-representation"].language === "eng")
		if (englishReleases.length === 1) {
			return englishReleases[0]!.media[0]!.tracks[0]!.title
		}
		latinReleases.sort((a, b) => {
			const aDate = a["release-group"]["first-release-date"]
			const bDate = b["release-group"]["first-release-date"]
			if (aDate && !bDate) return -1
			if (!aDate && bDate) return 1
			if (!aDate && !bDate) return 0
			return +aDate! - +bDate!
		})
		return latinReleases[0]!.media[0]!.tracks[0]!.title
	}

	preferredAlbumName(releaseGroup: z.infer<typeof musicBrainzReleaseGroupSchema>): string {
		if (releaseGroup.releases.length === 0) {
			return releaseGroup.title
		}
		const latinReleases = releaseGroup.releases.filter(release => release["text-representation"].script === "Latn")
		if (latinReleases.length === 1) {
			return latinReleases[0]!.title
		}
		if (latinReleases.length === 0) {
			return releaseGroup.title
		}
		const englishReleases = latinReleases.filter(release => release["text-representation"].language === "eng")
		if (englishReleases.length === 1) {
			return englishReleases[0]!.title
		}
		latinReleases.sort((a, b) => {
			if (a.date && !b.date) return -1
			if (!a.date && b.date) return 1
			if (!a.date && !b.date) return 0
			return +a.date! - +b.date!
		})
		return latinReleases[0]!.title
	}
}

function countLatinCharacters(str: string): number {
	let count = 0
	for (const char of str) {
		if (char.match(/[a-z]/i)) {
			count++
		}
	}
	return count
}
