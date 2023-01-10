import { z } from "zod"
import Queue from "utils/Queue"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import { fetchAndWriteImage } from "utils/writeImage"
import sanitizeString, { cleanGenreList } from "utils/sanitizeString"
import pathToSearch from "utils/pathToSearch"
import log from "utils/logger"
import retryable from "utils/retryable"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"
import { socketServer } from "utils/typedWs/server"

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
	URL extends `search?${string}type=track${string}` ? typeof trackSearchSchema["_type"]
	: URL extends `search?${string}type=artist${string}` ? typeof artistSearchSchema["_type"]
	: URL extends `search?${string}type=album${string}` ? typeof albumSearchSchema["_type"]
	: URL extends `artists/${string}/albums` ? typeof albumsListSchema["_type"]
	: URL extends `artists/${string}` ? typeof artistSchema["_type"]
	: URL extends `albums/${string}` ? typeof albumSchema["_type"]
	: URL extends `tracks/${string}` ? typeof trackSchema["_type"]
	: URL extends `audio-features/${string}` ? typeof audioFeaturesSchema["_type"]
	: never

type SpotifyApiResponse<URL extends SpotifyApiUrl> = SpotifyApiSuccessResponse<URL> | typeof notFoundSchema["_type"]

function getSchema(url: SpotifyApiUrl) {
	switch (true) {
		case url.startsWith("tracks/"): return trackSchema
		case url.startsWith("audio-features/"): return audioFeaturesSchema
		case url.startsWith("albums/"): return albumSchema
		case url.startsWith("artists/") && url.endsWith("/albums"): return albumsListSchema
		case url.startsWith("artists/"): return artistSchema
		case url.startsWith("search?") && url.includes("type=track"): return trackSearchSchema
		case url.startsWith("search?") && url.includes("type=artist"): return artistSearchSchema
		case url.startsWith("search?") && url.includes("type=album"): return albumSearchSchema
	}
}

function isListRequest(url: SpotifyApiUrl) {
	switch (true) {
		case url.startsWith("tracks/"): return false
		case url.startsWith("audio-features/"): return false
		case url.startsWith("albums/"): return false
		case url.startsWith("artists/") && url.endsWith("/albums"): return true
		case url.startsWith("artists/"): return false
		case url.startsWith("search?") && url.includes("type=track"): return true
		case url.startsWith("search?") && url.includes("type=artist"): return true
		case url.startsWith("search?") && url.includes("type=album"): return true
	}
}

class Spotify {
	static RATE_LIMIT = 200
	static STORAGE_LIMIT = 30

	#accessToken: string | null = null

	#authOptions: RequestInit = {
		headers: {
			"Authorization": "Basic " + (Buffer.from(env.SPOTIFY_CLIENT_ID + ":" + env.SPOTIFY_CLIENT_SECRET).toString("base64")),
			"Content-Type": "application/x-www-form-urlencoded",
			"Accept": "application/json",
		},
		method: "POST",
	}

	#queue: Queue

	constructor() {
		this.#authOptions.body = new URLSearchParams()
		this.#authOptions.body.append("grant_type", "client_credentials")
		this.#queue = new Queue(Spotify.RATE_LIMIT)
	}

	#refreshing: Promise<void> | null = null
	async #refreshToken(retries = 0, callback?: () => void) {
		if (this.#accessToken) {
			return
		}
		if (this.#refreshing && !callback) {
			return this.#refreshing
		}
		let resolve = callback
		if (!resolve)
			this.#refreshing = new Promise(r => resolve = r)
		try {
			const response = await fetch("https://accounts.spotify.com/api/token", this.#authOptions)
			const data = await response.json()
			this.#accessToken = data.access_token
			this.#refreshing = null
			resolve!()
			setTimeout(() => {
				this.#accessToken = null
			}, data.expires_in * 1000 - 100)
		} catch (error) {
			if (retries < 3) {
				const nextRetry = retries + 1
				await new Promise(resolve => setTimeout(resolve, 2**nextRetry * 100))
				await this.#refreshToken(nextRetry, resolve)
			} else {
				this.#refreshing = null
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
		const schema = getSchema(url)
		if (!schema) {
			throw new Error(`Unknown schema for ${url}`)
		}
		const union = z.union([
			notFoundSchema,
			schema,
		])
		const isList = isListRequest(url)
		const fullURL = `https://api.spotify.com/v1/${url}${isList ? "&limit=1" : ""}`
		await this.#queue.next()
		await this.#refreshToken()
		return retryable(async () => {
			const response = await fetch(fullURL, {
				headers: {
					"Authorization": `Bearer ${this.#accessToken}`,
					"Accept": "application/json",
				}
			})
			const json = await response.json()
			const data = union.parse(json)
			if (!("error" in data)) {
				this.#storeResponse(url, data as SpotifyApiSuccessResponse<URL>)
			}
			return data as SpotifyApiResponse<URL>
		})

	}
	
	/**
	 * @description Spotify doesn't seem to like for *all* encodable chars to be encoded.
	 * For example `+` (plus) shouldn't be encoded, and ` ` (space) encoded into a `'+'` doesn't always work
	 */
	sanitize(string: string): string {
		return sanitizeString(string).replace(/&/g, "%26")
	}

	#purgeStoreTimeout: NodeJS.Timeout | null = null
	#purgeStore() {
		if (!this.#purgeStoreTimeout) {
			this.#purgeStoreTimeout = setTimeout(() => {
				this.#purgeStoreTimeout = null
				if (this.#pastRequests.length > 0) {
					const key = this.#pastRequests.shift() as SpotifyApiUrl
					this.#pastResponses.delete(key)
				}
				if (this.#pastRequests.length > 0) {
					this.#purgeStore()
				}
			}, 60_000)
		}
	}

	#storeResponse<URL extends SpotifyApiUrl>(url: URL, response: SpotifyApiSuccessResponse<URL>) {
		this.#pastRequests.push(url)
		this.#pastResponses.set(url, response)
		if (this.#pastRequests.length > Spotify.STORAGE_LIMIT) {
			const key = this.#pastRequests.shift() as SpotifyApiUrl
			this.#pastResponses.delete(key)
		}
		this.#purgeStore()
	}
	
	#running = new Set<string>()
	async findTrack(trackDbId: string) {
		if (this.#running.has(trackDbId)) {
			return
		}
		this.#running.add(trackDbId)
		try {
			const datedTrack = await prisma.track.findUnique({
				where: { id: trackDbId },
				select: {
					spotifyDate: true,
					name: true,
				}
			})
			if (!datedTrack || !datedTrack.name) {
				log("warn", "409", "spotify", "not enough information to find track, need better strategy")
				this.#running.delete(trackDbId)
				return
			}
			if (datedTrack.spotifyDate && datedTrack.spotifyDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
				this.#running.delete(trackDbId)
				return false
			}
			await retryable(() => (
				prisma.track.update({
					where: { id: trackDbId },
					data: { spotifyDate: new Date().toISOString() },
				})
			))
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
							spotifyDate: true,
						},
					},
					album: {
						select: {
							id: true,
							name: true,
							spotifyDate: true,
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
			if (!track) {
				log("error", "409", "spotify", "could not find a track we just had a second ago")
				this.#running.delete(trackDbId)
				return
			}
			const spotifyTrack = track && track.spotify ? track.spotify : null
			if (spotifyTrack && spotifyTrack.album && spotifyTrack.artist && spotifyTrack.tempo) {
				log("info", "204", "spotify", `already got everything for ${track.name} by ${spotifyTrack.artist.name} in ${spotifyTrack.album.name} (${spotifyTrack.tempo}bps)`)
				this.#running.delete(trackDbId)
				return
			}
			const artistName = track.artist?.name
			const albumName = track.album?.name
			const fuzzySearch = !spotifyTrack && !artistName && !albumName && track.file?.path
				? this.sanitize(pathToSearch(track.file.path))
				: null
			if (!spotifyTrack && !artistName && !albumName && !fuzzySearch) {
				log("warn", "409", "spotify", `not enough information to find track ${track.name}, need better strategy`)
				console.log(trackDbId, track?.artist?.name, track?.album?.name, track?.name, track?.file?.path)
				this.#running.delete(trackDbId)
				return
			}
			let artistObject = spotifyTrack?.artist
			let albumObject = spotifyTrack?.album
			let albumImageData
			let spotifyTrackId = spotifyTrack?.id
			let changedTrack = false
			trackCreate: if (!spotifyTrack) {
				const search = fuzzySearch
					|| `track:${this.sanitize(track.name)}${artistName ? ` artist:${this.sanitize(artistName)}` : ""}${albumName ? ` album:${this.sanitize(albumName)}` : ""}`
				log("info", "fetch", "spotify", `${fuzzySearch ? "fuzzy " : ""}search: ${search}`)
				const trackData = await this.fetch(`search?type=track&q=${search}`)
				let candidate = ("tracks" in trackData)
					? trackData.tracks.items[0]
					: undefined
				if (!candidate) {
					if (artistName && albumName && typeof track.position === "number") {
						const search = `artist:${this.sanitize(artistName)} album:${this.sanitize(albumName)}`
						log("info", "fetch", "spotify", `fallback search: #${track.position} of ${search}`)
						const albumData = await this.fetch(`search?type=track&q=${search}`)
						if ("error" in albumData) {
							log("warn", "404", "spotify", `could not find track "${track.name}" by ${artistName} in ${albumName}`)
							break trackCreate
						}
						candidate = albumData.tracks.items.find(item => item.track_number === track.position)
						if (!candidate) {
							log("warn", "404", "spotify", `could not find track "${track.name}" by ${artistName} in ${albumName}`)
							break trackCreate
						}
					} else {
						log("warn", "404", "spotify", `could not find track "${track.name}" by ${artistName} in ${albumName}`)
						break trackCreate
					}
				}
				const [candidateArtist, ...featuring] = candidate.artists
				const albumFeat = candidateArtist
					? candidate.album.artists.filter(a => a.id !== candidateArtist.id)
					: []
				const candidate_id = candidate.id
				const candidate_name = candidate.name
				const candidate_popularity = candidate.popularity
				const candidate_duration_ms = candidate.duration_ms
				const candidate_explicit = candidate.explicit
				const candidate_track_number = candidate.track_number
				const candidate_disc_number = candidate.disc_number
				const candidate_album_id = candidate.album.id
				const candidate_album_name = candidate.album.name
				const candidate_album_album_type = candidate.album.album_type
				const candidate_album_release_date = candidate.album.release_date
				const candidate_album_total_tracks = candidate.album.total_tracks
				const candidate_album_popularity = candidate.album.popularity

				const existing = await retryable(() => prisma.spotifyTrack.findUnique({
					where: {id: candidate_id},
					select: {
						id: true,
						trackId: true,
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
					}
				}))
				if (existing && !existing.trackId) {
					// this should not happen as schema.prisma defines SpotifyTrack.track as `onDelete: Cascade`
					await retryable(() => 
						prisma.spotifyTrack.update({
							where: {id: candidate_id},
							data: {
								track: {
									connect: {
										id: track.id,
									}
								},
							}
						})
					)
				}
				const newTrack = existing || await retryable(async () => {
					return await prisma.spotifyTrack.create({
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
							id: candidate_id,
							name: candidate_name,
							popularity: candidate_popularity,
							durationMs: candidate_duration_ms,
							explicit: candidate_explicit,
							trackNumber: candidate_track_number,
							discNumber: candidate_disc_number,
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
										id: candidate_album_id
									},
									create: {
										id: candidate_album_id,
										name: candidate_album_name,
										albumType: candidate_album_album_type,
										releaseDate: candidate_album_release_date,
										totalTracks: candidate_album_total_tracks,
										popularity: candidate_album_popularity,
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
				})
				if (!existing) {
					log("ready", "200", "spotify", `fetched track ${candidate_name}`)
				}
				if (track.artist?.id && newTrack.artist?.id) {
					const newTrackArtistId = newTrack.artist.id
					const trackArtistId = track.artist.id
					await retryable(async () => {
						const foundToConnect = await prisma.spotifyArtist.findUnique({
							where: {
								id: newTrackArtistId,
								artist: null,
							},
							select: {id: true},
						})
						if (foundToConnect) {
							await prisma.spotifyArtist.update({
								where: {id: foundToConnect.id},
								data: {
									artist: {
										connect: {
											id: trackArtistId,
										}
									}
								}
							})
						}
					})
				}
				if (track.album?.id && newTrack.album?.id) {
					const newTrackAlbumId = newTrack.album.id
					const trackAlbumId = track.album.id
					await retryable(async () => {
						const foundToUpdate = await prisma.spotifyAlbum.findUnique({
							where: {
								id: newTrackAlbumId,
								album: null
							},
							select: {id: true},
						})
						if (foundToUpdate) {
							await prisma.spotifyAlbum.update({
								where: {id: foundToUpdate.id},
								data: {
									album: {
										connect: {
											id: trackAlbumId,
										}
									}
								}
							})
						}
					})
				}
				artistObject = newTrack.artist
				albumObject = newTrack.album
				albumImageData = candidate.album.images
				spotifyTrackId = newTrack.id
				changedTrack = true
			}
			albumFill: if (albumObject && !albumObject.imageId) {
				if (!albumImageData) {
					if (track.album?.spotifyDate && track.album.spotifyDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
						break albumFill
					}
					if (track.album) {
						const id = track.album.id
						await retryable(() => (
							prisma.album.update({
								where: { id },
								data: { spotifyDate: new Date().toISOString() },
							})
						))
					}
					const albumData = await this.fetch(`albums/${albumObject.id}`)
					if ("error" in albumData) {
						break albumFill
					}
					albumImageData = albumData.images
				}
				const image = albumImageData.sort((a, b) => b.height - a.height)[0]
				if (!image) {
					break albumFill
				}
				const {hash, path, mimetype, palette} = await fetchAndWriteImage(image.url)
				if (hash && path && palette) {
					const albumId = albumObject.id
					await retryable(async () => {
						await prisma.spotifyAlbum.update({
							where: {
								id: albumId
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
					})
				}
				changedTrack = true
				log("ready", "200", "spotify", `fetched album ${albumObject.name}`)
			}
			artistFill: if (artistObject && !artistObject.imageId) {
				if (track.artist?.spotifyDate && track.artist.spotifyDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
					break artistFill
				}
				if (track.artist) {
					const id = track.artist.id
					await retryable(() => (
						prisma.artist.update({
							where: { id },
							data: { spotifyDate: new Date().toISOString() },
						})
					))
				}
				const artistData = await this.fetch(`artists/${artistObject.id}`)
				if ("error" in artistData) {
					break artistFill
				}
				const image = artistData.images?.sort((a, b) => b.height - a.height)[0]
				if (image) {
					const {hash, path, mimetype, palette} = await fetchAndWriteImage(image.url)
					if (hash && path && palette) {
						const artistId = artistObject.id
						const popularity = artistData.popularity
						await retryable(async () => {
							await prisma.spotifyArtist.update({
								where: {
									id: artistId
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
									popularity,
									genres: {
										connectOrCreate: cleanGenreList(artistData.genres || []).map(({name, simplified}) => ({
											where: { simplified },
											create: { name, simplified }
										}))
									}
								}
							})
						})
					}
				} else {
					const artistId = artistObject.id
					await retryable(async () => {
						await prisma.spotifyArtist.update({
							where: {
								id: artistId
							},
							data: {
								popularity: artistData.popularity,
								genres: {
									connectOrCreate: cleanGenreList(artistData.genres || []).map(({name, simplified}) => ({
										where: { simplified },
										create: { name, simplified }
									}))
								}
							}
						})
					})
				}
				changedTrack = true
				log("ready", "200", "spotify", `fetched artist ${artistObject.name}`)
			}
			featuresFill: if (!spotifyTrack?.tempo && spotifyTrackId) {
				const featuresData = await this.fetch(`audio-features/${spotifyTrackId}`)
				if ("error" in featuresData) {
					log("error", "500", "spotify", `Could not find audio-features for ${spotifyTrackId}`)
					break featuresFill
				}
				await retryable(async () => {
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
				})
				changedTrack = true
				log("ready", "200", "spotify", `fetched track features ${track.name}`)
			}
			artistConnect: if (artistObject && !artistObject.artistId) {
				const singleChoice = await prisma.artist.findMany({
					where: {
						name: artistObject.name,
						spotify: null,
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
				const artistId = artistObject.id
				await retryable(async () => {
					await prisma.artist.update({
						where: {
							id: result.id
						},
						data: {
							spotify: {
								connect: {
									id: artistId,
								}
							}
						}
					})
				})
				const artistChangedCover = await computeArtistCover(result.id, {album: true, tracks: true})
				if (!artistChangedCover) {
					socketServer.emit("invalidate", {type: "artist", id: result.id})
				}
				changedTrack = true
			}
			albumConnect: if (albumObject && !albumObject.albumId && artistObject?.name) {
				const albumName = albumObject.name
				const artistName = artistObject.name
				const singleChoice = await retryable(async () => {
					return await prisma.album.findMany({
						where: {
							name: albumName,
							spotify: null,
							artist: {
								name: artistName,
							}
						},
						take: 2,
						select: {
							id: true,
						},
					})
				})
				const result = singleChoice[0]
				if (!result || singleChoice.length !== 1) {
					break albumConnect
				}
				const artistId = albumObject.id
				await retryable(async () => {
					const foundToUpdate = await prisma.spotifyAlbum.findUnique({
						where: {
							id: artistId,
							artist: null,
						},
						select: {id: true},
					})
					if (foundToUpdate) {
						await prisma.spotifyAlbum.update({
							where: {id: foundToUpdate.id},
							data: {
								album: {
									connect: {
										id: result.id,
									}
								}
							}
						})
					}
				})
				const albumChangedCover = await computeAlbumCover(result.id, {artist: true, tracks: true})
				if (!albumChangedCover) {
					socketServer.emit("invalidate", {type: "album", id: result.id})
				}
				changedTrack = true
			}
	
			if (changedTrack) {
				const trackChangedCover = await computeTrackCover(trackDbId, {album: true, artist: true})
				if (!trackChangedCover) {
					socketServer.emit("invalidate", {type: "track", id: trackDbId})
				}
				log("ready", "200", "spotify", `did all of the things for track ${track.name}`)
			}

		} catch (e) {
			console.error(e)
		}
		this.#running.delete(trackDbId)
	}
}

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const spotify = (globalThis.spotify || new Spotify()) as InstanceType<typeof Spotify>
// @ts-expect-error -- see above
globalThis.spotify = spotify
