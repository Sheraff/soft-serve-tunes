import { env } from "../../env/server.mjs"
import { z } from "zod"
import Queue from "../../utils/Queue"

const imageSchema = z.object({
	url: z.string(),
	width: z.number(),
	height: z.number(),
})

const artistSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.literal("artist"),
	images: z.array(imageSchema).optional(),
	popularity: z.number().optional(),
	genres: z.array(z.string()).optional(),
})

const audioFeaturesSchema = z.object({
	danceability: z.number(),
	energy: z.number(),
	key: z.number(),
	loudness: z.number(),
	mode: z.number(),
	speechiness: z.number(),
	acousticness: z.number(),
	instrumentalness: z.number(),
	liveness: z.number(),
	valence: z.number(),
	tempo: z.number(),
	type: z.literal("audio_features"),
	id: z.string(),
	duration: z.number(),
	time_signature: z.number(),
})

const baseTrackSchema = z.object({
	artists: z.array(artistSchema),
	disc_number: z.number(),
	duration_ms: z.number(),
	explicit: z.boolean(),
	id: z.string(),
	name: z.string(),
	popularity: z.number(),
	track_number: z.number(),
	type: z.literal("track"),
})

const albumSchema = z.object({
	album_type: z.string(),
	artists: z.array(artistSchema),
	id: z.string(),
	images: z.array(imageSchema),
	name: z.string(),
	release_date: z.string().transform(v => new Date(v)),
	type: z.literal("album"),
	popularity: z.number().optional(),
	total_tracks: z.number().optional(),
	tracks: z.object({
		items: z.array(baseTrackSchema),
		total: z.number(),
	}).optional(),
})

const trackSchema = baseTrackSchema.extend({
	album: albumSchema,
})

const notFoundSchema = z.object({
	error: z.object({
		message: z.string(),
		status: z.number(),
	}),
})

const trackSearchSchema = z.object({ // /search?type=track
	tracks: z.object({
		items: z.array(trackSchema),
		total: z.number(),
	}) 
})

const artistSearchSchema = z.object({ // /search?type=artist
	artists: z.object({
		items: z.array(artistSchema),
		total: z.number(),
	}) 
})

const albumSearchSchema = z.object({ // /search?type=album
	albums: z.object({
		items: z.array(albumSchema),
		total: z.number(),
	}) 
})

const albumsListSchema = z.object({ // /artists/{id}/albums
	items: z.array(albumSchema),
	total: z.number(),
})

const responseSchema = z.union([
	notFoundSchema,
	trackSearchSchema, // /search?type=track
	artistSearchSchema, // /search?type=artist
	albumSearchSchema, // /search?type=album
	albumsListSchema, // /artists/{id}/albums
	z.discriminatedUnion("type", [
		artistSchema, // /artists/{id}
		albumSchema, // /albums/{id}
		trackSchema, // /tracks/{id}
		audioFeaturesSchema, // /audio-features/{id}
	])
])

type SpotifyApiUrl = 
	`search?${string}type=track${string}`
	| `search?${string}type=artist${string}`
	| `search?${string}type=album${string}`
	| `artists/${string}/albums`
	| `artists/${string}`
	| `albums/${string}`
	| `tracks/${string}`
	| `audio-features/${string}`

type SpotifyApiSuccessResponse<URL extends SpotifyApiUrl> =
	URL extends `search?${string}type=track${string}` ? typeof trackSearchSchema['_type']
	: URL extends `search?${string}type=artist${string}` ? typeof artistSearchSchema['_type']
	: URL extends `search?${string}type=album${string}` ? typeof albumSearchSchema['_type']
	: URL extends `artists/${string}/albums` ? typeof albumsListSchema['_type']
	: URL extends `artists/${string}` ? typeof artistSchema['_type']
	: URL extends `albums/${string}` ? typeof albumSchema['_type']
	: URL extends `tracks/${string}` ? typeof trackSchema['_type']
	: URL extends `audio-features/${string}` ? typeof audioFeaturesSchema['_type']
	: never

type SpotifyApiResponse<URL extends SpotifyApiUrl> = SpotifyApiSuccessResponse<URL> | typeof notFoundSchema['_type']

function getSchema(url: SpotifyApiUrl) {
	switch (true) {
		case url.startsWith('tracks/'): return trackSchema
		case url.startsWith('audio-features/'): return audioFeaturesSchema
		case url.startsWith('albums/'): return albumSchema
		case url.startsWith('artists/') && url.endsWith('/albums'): return albumsListSchema
		case url.startsWith('artists/'): return artistSchema
		case url.startsWith('search?') && url.includes('type=track'): return trackSearchSchema
		case url.startsWith('search?') && url.includes('type=artist'): return artistSearchSchema
		case url.startsWith('search?') && url.includes('type=album'): return albumSearchSchema
	}
}

class Spotify {
	static RATE_LIMIT = 300
	static STORAGE_LIMIT = 50

	#accessToken: string | null = null

	#authOptions: RequestInit = {
		headers: {
			'Authorization': 'Basic ' + (Buffer.from(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET).toString('base64')),
			'Content-Type': 'application/x-www-form-urlencoded',
			'Accept': 'application/json',
		},
		method: 'POST',
	}

	#queue: Queue

	constructor() {
		this.#authOptions.body = new URLSearchParams()
		this.#authOptions.body.append('grant_type', 'client_credentials')
		this.#queue = new Queue(Spotify.RATE_LIMIT)
	}

	async #refreshToken(retries = 0) {
		if (this.#accessToken) {
			return
		}
		try {
			const response = await fetch('https://accounts.spotify.com/api/token', this.#authOptions)
			const data = await response.json()
			this.#accessToken = data.access_token
			setTimeout(() => {
				this.#accessToken = null
			}, data.expires_in * 1000 - 100)
		} catch (error) {
			if (retries < 3) {
				const nextRetry = retries + 1
				await new Promise(resolve => setTimeout(resolve, 2**nextRetry * 100))
				await this.#refreshToken(nextRetry)
			} else {
				throw error
			}
		}
	}

	#pastRequests: SpotifyApiUrl[] = []
	#pastResponses: Map<SpotifyApiUrl, typeof responseSchema['_type']> = new Map()

	async fetch<URL extends SpotifyApiUrl>(url: URL): Promise<SpotifyApiResponse<URL>> {
		const cached = this.#pastResponses.get(url) as (SpotifyApiSuccessResponse<URL> | undefined)
		if (cached) {
			return cached
		}
		await this.#queue.next()
		await this.#refreshToken()
		const request = fetch(`https://api.spotify.com/v1/${url}`, {
			headers: {
				'Authorization': `Bearer ${this.#accessToken}`,
				'Accept': 'application/json',
			}
		}).then(async response => {
			const json = await response.json()
			const schema = getSchema(url)
			if (!schema) {
				throw new Error(`Unknown schema for ${url}`)
			}
			const data = z.union([
				notFoundSchema,
				schema,
			]).parse(json)
			if (!('error' in data)) {
				this.#storeResponse(url, data as SpotifyApiSuccessResponse<URL>)
			}
			return data
		})
		return request as Promise<SpotifyApiResponse<URL>>
	}

	#storeResponse<URL extends SpotifyApiUrl>(url: URL, response: SpotifyApiSuccessResponse<URL>) {
		this.#pastRequests.push(url)
		this.#pastResponses.set(url, response)
		if (this.#pastRequests.length > Spotify.STORAGE_LIMIT) {
			const key = this.#pastRequests.shift() as SpotifyApiUrl
			this.#pastResponses.delete(key)
		}
	}
}

declare global {
	var spotify: Spotify | null;
}

export const spotify = globalThis.spotify
	|| new Spotify()

if (env.NODE_ENV !== "production") {
	globalThis.spotify = spotify
}