import { env } from "../../env/server.mjs"
import { z } from "zod"
import Queue from "../../utils/Queue"

const imageSchema = z.object({
	url: z.string(),
	width: z.number(),
	height: z.number(),
})

const artistSchema = z.object({
	href: z.string(),
	id: z.string(),
	name: z.string(),
	type: z.enum(["artist"]),
	uri: z.string(),
})

const albumSchema = z.object({
	album_type: z.string(),
	artists: z.array(artistSchema),
	href: z.string(),
	id: z.string(),
	images: z.array(imageSchema),
	name: z.string(),
	release_date: z.string().transform(v => new Date(v)),
	release_date_precision: z.string(),
	type: z.enum(["album"]),
	uri: z.string(),
})

const trackSchema = z.object({
	album: albumSchema,
	artists: z.array(artistSchema),
	disc_number: z.number(),
	duration_ms: z.number(),
	explicit: z.boolean(),
	external_urls: z.object({
		isrc: z.string().optional(),
	}),
	href: z.string(),
	id: z.string(),
	name: z.string(),
	popularity: z.number(),
	preview_url: z.string(),
	track_number: z.number(),
	type: z.enum(["track"]),
	uri: z.string(),
})

const notFoundSchema = z.object({
	error: z.object({
		message: z.string(),
		status: z.number(),
	}),
})

const responseSchema = z.union([
	notFoundSchema,
	z.object({
		tracks: z.object({
			items: z.array(trackSchema),
			total: z.number(),
		}) 
	})
])

class Spotify {
	static RATE_LIMIT = 300
	static STORAGE_LIMIT = 50

	accessToken: string | null = null

	authOptions: RequestInit = {
		headers: {
			'Authorization': 'Basic ' + (Buffer.from(env.SPOTIFY_CLIENT_ID + ':' + env.SPOTIFY_CLIENT_SECRET).toString('base64')),
			'Content-Type': 'application/x-www-form-urlencoded',
			'Accept': 'application/json',
		},
		method: 'POST',
	}

	queue: Queue

	pastRequests: string[] = []
	pastResponses: Map<string, typeof responseSchema['_type']> = new Map()

	constructor() {
		this.authOptions.body = new URLSearchParams()
		this.authOptions.body.append('grant_type', 'client_credentials')
		this.queue = new Queue(Spotify.RATE_LIMIT)
	}

	async refreshToken(retries = 0) {
		if (this.accessToken) {
			return
		}
		try {
			const response = await fetch('https://accounts.spotify.com/api/token', this.authOptions)
			const data = await response.json()
			this.accessToken = data.access_token
			setTimeout(() => {
				this.accessToken = null
			}, data.expires_in * 1000 - 100)
		} catch (error) {
			if (retries < 3) {
				const nextRetry = retries + 1
				await new Promise(resolve => setTimeout(resolve, 2**nextRetry * 100))
				await this.refreshToken(nextRetry)
			} else {
				throw error
			}
		}
	}

	async fetch(url: string) {
		const cached = this.pastResponses.get(url)
		if (cached) {
			return cached
		}
		await this.queue.next()
		await this.refreshToken()
		const request = fetch(`https://api.spotify.com/v1/${url}`, {
			headers: {
				'Authorization': `Bearer ${this.accessToken}`,
				'Accept': 'application/json',
			}
		}).then(async response => {
			const json = await response.json()
			const data = responseSchema.parse(json)
			if (!('error' in data)) {
				this.storeResponse(url, data)
			}
			return data
		})
		return request
	}

	storeResponse(url: string, response: typeof responseSchema['_type']) {
		this.pastRequests.push(url)
		this.pastResponses.set(url, response)
		if (this.pastRequests.length > Spotify.STORAGE_LIMIT) {
			const key = this.pastRequests.shift() as string
			this.pastResponses.delete(key)
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