import { env } from "../../env/server.mjs"
import { z } from "zod"
import Queue from "../../utils/Queue"
import { prisma } from "../db/client"
import { fetchAndWriteImage } from "../../utils/writeImage"
import { sep } from "path"
import sanitizeString from "../../utils/sanitizeString"
import pathToSearch from "../../utils/pathToSearch"

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
	time_signature: z.number(),
})

const baseTrackSchema = z.object({
	artists: z.array(artistSchema),
	disc_number: z.number(),
	duration_ms: z.number(),
	explicit: z.boolean(),
	id: z.string(),
	name: z.string(),
	popularity: z.number().optional(),
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
	static RATE_LIMIT = 200
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
	#pastResponses: Map<SpotifyApiUrl, SpotifyApiSuccessResponse<SpotifyApiUrl>> = new Map()

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

export async function findTrack(trackDbId: string) {
	const track = await prisma.track.findUnique({
		where: { id: trackDbId },
		select: {
			id: true,
			name: true,
			position: true,
			artist: {
				select: {
					id: true,
					name: true,
				},
			},
			album: {
				select: {
					id: true,
					name: true,
				}
			},
			file: {
				select: {
					path: true,
				}
			},
			spotify: {
				select: {
					id: true,
					tempo: true,
					album: {
						select: {
							id: true,
							imageId: true,
							albumId: true,
							name: true,
							artist: {
								select: {
									id: true,
								}
							}
						}
					},
					artist: {
						select: {
							id: true,
							imageId: true,
							artistId: true,
							name: true,
						}
					}
				}
			}
		}
	})
	if (!track || !track.name) {
		console.log(`\x1b[33m409  \x1b[0m - spotify: not enough information to find track, need better strategy`)
		console.log(trackDbId, track?.artist?.name, track?.album?.name, track?.name, track?.file?.path)
		return
	}
	const spotifyTrack = track && track.spotify ? track.spotify : null
	if (spotifyTrack && spotifyTrack.album && spotifyTrack.artist && spotifyTrack.tempo) {
		console.log('\x1b[36m204  \x1b[0m - spotify: already got everything')
		return
	}
	const artistName = track.artist?.name
	const albumName = track.album?.name
	const fuzzySearch = !spotifyTrack && !artistName && !albumName && track.file?.path
		? sanitizeString(pathToSearch(track.file.path))
		: null
	if (!spotifyTrack && !artistName && !albumName && !fuzzySearch) {
		console.log(`\x1b[33m409  \x1b[0m - spotify: not enough information to find track, need better strategy`)
		console.log(trackDbId, track?.artist?.name, track?.album?.name, track?.name, track?.file?.path)
		return
	}
	let artistObject = spotifyTrack?.artist
	let albumObject = spotifyTrack?.album
	let albumImageData
	let spotifyTrackId = spotifyTrack?.id
	trackCreate: if (!spotifyTrack) {
		const search = fuzzySearch
			|| `track:${sanitizeString(track.name)}${artistName ? ` artist:${sanitizeString(artistName)}` : ''}${albumName ? ` album:${sanitizeString(albumName)}` : ''}`
		console.log(`\x1b[36mfetch\x1b[0m - spotify${fuzzySearch ? ' fuzzy' : ''} search: ${search}`)
		const trackData = await spotify.fetch(`search?type=track&q=${search}`)
		if ('error' in trackData) {
			console.log(`\x1b[33m404  \x1b[0m - spotify: could not find track`)
			break trackCreate
		}
		let candidate = trackData.tracks.items[0]
		if (!candidate) {
			if (artistName && albumName && typeof track.position === 'number') {
				const search = `artist:${sanitizeString(artistName)} album:${sanitizeString(albumName)}`
				console.log(`\x1b[36mfetch\x1b[0m - spotify fallback search: #${track.position} of ${search}`)
				const albumData = await spotify.fetch(`search?type=track&q=${search}`)
				if ('error' in albumData) {
					console.log(`\x1b[33m404  \x1b[0m - spotify: could not find track`)
					break trackCreate
				}
				candidate = albumData.tracks.items.find(item => item.track_number === track.position)
				if (!candidate) {
					console.log(`\x1b[33m404  \x1b[0m - spotify: could not find track`)
					break trackCreate
				}
			} else {
				console.log(`\x1b[33m404  \x1b[0m - spotify: could not find track`)
				break trackCreate
			}
		}
		const [candidateArtist, ...featuring] = candidate.artists
		const albumFeat = candidateArtist
			? candidate.album.artists.filter(a => a.id !== candidateArtist.id)
			: []
		const newTrack = await prisma.spotifyTrack.create({
			select: {
				id: true,
				artist: {
					select: {
						id: true,
						imageId: true,
						artistId: true,
						name: true,
					}
				},
				album: {
					select: {
						id: true,
						imageId: true,
						albumId: true,
						name: true,
						artist: {
							select: {
								id: true,
							}
						}
					}
				}
			},
			data: {
				track: {
					connect: {
						id: track.id,
					}
				},
				id: candidate.id,
				name: candidate.name,
				popularity: candidate.popularity,
				durationMs: candidate.duration_ms,
				explicit: candidate.explicit,
				trackNumber: candidate.track_number,
				discNumber: candidate.disc_number,
				...(candidateArtist ? { artist: {
					connectOrCreate: {
						where: {
							id: candidateArtist.id
						},
						create: {
							id: candidateArtist.id,
							name: candidateArtist.name,
						},
					}
				}} : {}),
				...(featuring.length ? {
					feats: {
						connectOrCreate: featuring.map(artist => ({
							where: {
								id: artist.id,
							},
							create: {
								id: artist.id,
								name: artist.name,
							}
						}))
					}
				} : {}),
				album: {
					connectOrCreate: {
						where: {
							id: candidate.album.id
						},
						create: {
							id: candidate.album.id,
							name: candidate.album.name,
							albumType: candidate.album.album_type,
							releaseDate: candidate.album.release_date,
							totalTracks: candidate.album.total_tracks,
							...(candidateArtist ? { artist: {
								connectOrCreate: {
									where: {
										id: candidateArtist.id
									},
									create: {
										id: candidateArtist.id,
										name: candidateArtist.name,
									},
								}
							}} : {}),
							...(albumFeat.length ? {
								feats: {
									connectOrCreate: albumFeat.map(artist => ({
										where: {
											id: artist.id,
										},
										create: {
											id: artist.id,
											name: artist.name,
										}
									}))
								}
							} : {}),
						}
					}
				}
			}
		})
		if (track.artist?.id && newTrack.artist?.id) {
			await prisma.spotifyArtist.update({
				where: {
					id: newTrack.artist.id,
					artistId: undefined,
				},
				data: {
					artist: {
						connect: {
							id: track.artist.id,
						}
					}
				}
			})
		}
		if (track.album?.id && newTrack.album?.id) {
			await prisma.spotifyAlbum.update({
				where: {
					id: newTrack.album.id,
					albumId: undefined,
				},
				data: {
					album: {
						connect: {
							id: track.album.id,
						}
					}
				}
			})
		}
		artistObject = newTrack.artist
		albumObject = newTrack.album
		albumImageData = candidate.album.images
		spotifyTrackId = newTrack.id
	}
	albumFill: if (albumObject && !albumObject.imageId) {
		if (!albumImageData) {
			const albumData = await spotify.fetch(`albums/${albumObject.id}`)
			if ('error' in albumData) {
				break albumFill
			}
			albumImageData = albumData.images
		}
		const image = albumImageData.sort((a, b) => b.height - a.height)[0]
		if (!image) {
			break albumFill
		}
		const {hash, path, mimetype, palette} = await fetchAndWriteImage(image.url)
		if (hash) {
			await prisma.spotifyAlbum.update({
				where: {
					id: albumObject.id
				},
				data: {
					image: {
						connectOrCreate: {
							where: {
								id: hash
							},
							create: {
								id: hash,
								path,
								mimetype,
								palette,
							}
						}
					}
				}
			})
		}
	}
	artistFill: if (artistObject && !artistObject.imageId) {
		const artistData = await spotify.fetch(`artists/${artistObject.id}`)
		if ('error' in artistData) {
			break artistFill
		}
		const image = artistData.images?.sort((a, b) => b.height - a.height)[0]
		if (image) {
			const {hash, path, mimetype, palette} = await fetchAndWriteImage(image.url)
			if(hash) {
				await prisma.spotifyArtist.update({
					where: {
						id: artistObject.id
					},
					data: {
						image: {
							connectOrCreate: {
								where: {
									id: hash
								},
								create: {
									id: hash,
									path,
									mimetype,
									palette,
								}
							}
						},
						popularity: artistData.popularity,
						...(artistData.genres?.length ? {
							genres: {
								connectOrCreate: artistData.genres.map(genre => ({
									where: {
										name: genre,
									},
									create: {
										name: genre,
									}
								}))
							}
						} : {}),
					}
				})
			}
		} else {
			await prisma.spotifyArtist.update({
				where: {
					id: artistObject.id
				},
				data: {
					popularity: artistData.popularity,
					...(artistData.genres?.length ? {
						genres: {
							connectOrCreate: artistData.genres.map(genre => ({
								where: {
									name: genre,
								},
								create: {
									name: genre,
								}
							}))
						}
					} : {}),
				}
			})
		}
	}
	featuresFill: if (!spotifyTrack?.tempo && spotifyTrackId) {
		const featuresData = await spotify.fetch(`audio-features/${spotifyTrackId}`)
		if ('error' in featuresData) {
			break featuresFill
		}
		await prisma.spotifyTrack.update({
			where: {
				id: spotifyTrackId
			},
			data: {
				danceability: featuresData.danceability,
				energy: featuresData.energy,
				key: featuresData.key,
				loudness: featuresData.loudness,
				mode: featuresData.mode,
				speechiness: featuresData.speechiness,
				acousticness: featuresData.acousticness,
				instrumentalness: featuresData.instrumentalness,
				liveness: featuresData.liveness,
				valence: featuresData.valence,
				tempo: featuresData.tempo,
				timeSignature: featuresData.time_signature,
			}
		})
	}
	artistConnect: if (artistObject && !artistObject.artistId) {
		const singleChoice = await prisma.artist.findMany({
			where: {
				name: artistObject.name,
				spotify: undefined,
			},
			take: 2,
			select: {
				id: true,
			},
		})
		const result = singleChoice[0]
		if (!result || singleChoice.length !== 1) {
			break artistConnect
		}
		await prisma.artist.update({
			where: {
				id: result.id
			},
			data: {
				spotify: {
					connect: {
						id: artistObject.id,
					}
				}
			}
		})
	}
	albumConnect: if (albumObject && !albumObject.albumId && artistObject?.name) {
		const singleChoice = await prisma.album.findMany({
			where: {
				name: albumObject.name,
				spotify: null,
				artist: {
					name: artistObject.name,
				}
			},
			take: 2,
			select: {
				id: true,
			},
		})
		const result = singleChoice[0]
		if (!result || singleChoice.length !== 1) {
			break albumConnect
		}
		await prisma.spotifyAlbum.update({
			where: {
				id: albumObject.id
			},
			data: {
				album: {
					connect: {
						id: result.id,
					}
				}
			}
		})
	}
}

declare global {
	// eslint-disable-next-line no-var
	var spotify: Spotify | null;
}

export const spotify = globalThis.spotify
	|| new Spotify()

if (env.NODE_ENV !== "production") {
	globalThis.spotify = spotify
}