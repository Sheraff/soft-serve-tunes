import { createRouter } from "./context"
import { env } from "../../env/server.mjs"
import { socketServer } from "../ws"
import type { WebSocket } from 'ws'
import { z } from "zod"
import { fetchAndWriteImage } from "../../utils/writeImage"

const callbacks = new Map<string, Array<() => void>>()

socketServer.registerActor('audiodb:subscribe', async (ws: WebSocket, {id}: {id: string}) => {
	const existing = callbacks.get(id)
	if (!existing) {
		console.error(`Start the long-running process for ${id} by first calling \`trpc.useMutation("audiodb.fetch").mutate({id})\` and subscribing if the response tell you to.`)
		return
	}
	existing.push(() => {
		if (socketServer.isAlive(ws)) {
			ws.send(JSON.stringify({type: 'audiodb:done'}))
		}
	})
})

const audiodbArtistSchema = z.object({
	idArtist: z.string().transform(Number),
	strArtist: z.string(),
	intFormedYear: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
	intBornYear: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
	strMusicBrainzID: z.union([z.string().optional(), z.null()]),
	strBiographyEN: z.union([z.string().optional(), z.null()]),
	strArtistThumb: z.union([z.string().optional(), z.null()]),
	strArtistLogo: z.union([z.string().optional(), z.null()]),
	strArtistCutout: z.union([z.string().optional(), z.null()]),
	strArtistClearart: z.union([z.string().optional(), z.null()]),
	strArtistWideThumb: z.union([z.string().optional(), z.null()]),
	strArtistBanner: z.union([z.string().optional(), z.null()]),
})

const audiodbAlbumSchema = z.object({
	idAlbum: z.string().transform(Number),
	idArtist: z.string().transform(Number),
	strAlbum: z.string(),
	intYearReleased: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
	strMusicBrainzID: z.union([z.string().optional(), z.null()]),
	strDescriptionEN: z.union([z.string().optional(), z.null()]),
	strAlbumThumb: z.union([z.string().optional(), z.null()]),
	strAlbumThumbHQ: z.union([z.string().optional(), z.null()]),
	strAlbumCDart: z.union([z.string().optional(), z.null()]),
	strAllMusicID: z.union([z.string().optional(), z.null()]),
	strBBCReviewID: z.union([z.string().optional(), z.null()]),
	strRateYourMusicID: z.union([z.string().optional(), z.null()]),
	strDiscogsID: z.union([z.string().optional(), z.null()]),
	strWikidataID: z.union([z.string().optional(), z.null()]),
	strWikipediaID: z.union([z.string().optional(), z.null()]),
	strGeniusID: z.union([z.string().optional(), z.null()]),
	strLyricWikiID: z.union([z.string().optional(), z.null()]),
	strMusicMozID: z.union([z.string().optional(), z.null()]),
	strItunesID: z.union([z.string().optional(), z.null()]),
	strAmazonID: z.union([z.string().optional(), z.null()]),
})

const audiodbTrackSchema = z.object({
	idTrack: z.string().transform(Number),
	idAlbum: z.string().transform(Number),
	strTrack: z.string(),
	intDuration: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
	strGenre: z.union([z.string().optional(), z.null()]),
	strTrackThumb: z.union([z.string().optional(), z.null()]),
	strMusicVid: z.union([z.string().optional(), z.null()]),
	intTrackNumber: z.union([z.string().optional(), z.null()]).transform(val => val ? parseInt(val) : undefined),
	strMusicBrainzID: z.union([z.string().optional(), z.null()]),
})

export const audiodbRouter = createRouter()
	.query("get.artist", {
		input: z.object({
			id: z.string()
		}),
		async resolve({ input, ctx }) {
			return ctx.prisma.artist.findUnique({
				where: { id: input.id },
				include: {
					audiodb: {
						include: {
							albums: {
								orderBy: {
									intYearReleased: "desc"
								},
								include: {
									tracks: {
										orderBy: {
											intTrackNumber: "asc"
										}
									}
								}
							}
						}
					}
				}
			})
		}
	})
	.query("get.track", {
		input: z.object({
			id: z.string()
		}),
		async resolve({ input, ctx }) {
			return ctx.prisma.track.findUnique({
				where: { id: input.id },
				include: {
					audiodb: true
				}
			})
		}
	})
	.query("get.album", {
		input: z.object({
			id: z.string()
		}),
		async resolve({ input, ctx }) {
			return ctx.prisma.album.findUnique({
				where: { id: input.id },
				include: {
					audiodb: true
				}
			})
		}
	})
	.mutation("fetch", {
		input: z.object({
			id: z.string(),
		}),
		async resolve({ ctx, input }) {
			const existing = await ctx.prisma.audioDbArtist.findUnique({
				where: { entityId: input.id },
			})
			if (existing) {
				return true
			}
			if (callbacks.has(input.id)) {
				return false
			}
			callbacks.set(input.id, [])
			ctx.prisma.artist.findUnique({
				where: { id: input.id },
				select: {
					id: true,
					name: true,
					lastfm: {
						select: {
							mbid: true,
						}
					},
					albums: {
						select: {
							id: true,
							name: true,
							lastfm: {
								select: {
									mbid: true,
								}
							},
						}
					},
					tracks: {
						select: {
							id: true,
							name: true,
							albumId: true,
							lastfm: {
								select: {
									mbid: true,
								}
							},
						}
					}
				},
			})
				.then(async (artist) => {
					if (!artist) {
						resolveForId(input.id)
						return
					}
					await new Promise(resolve => enqueue(() => resolve(undefined)))
					const artistsUrl = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/search.php`, 'https://theaudiodb.com')
					artistsUrl.searchParams.set('s', artist.name)
					console.log(`fetching ${artistsUrl.toString()}`)
					const artistsData = await fetch(artistsUrl)
					const artistsJson = await artistsData.json()
					if (!artistsJson.artists || artistsJson.artists.length === 0) {
						console.log(`No artist found for ${artist.name}`)
						resolveForId(input.id)
						return
					}
					const audiodbArtists = z.object({artists: z.array(audiodbArtistSchema)}).parse(artistsJson)
					let audiodbArtist
					if (audiodbArtists.artists.length === 1) {
						audiodbArtist = audiodbArtists.artists[0]
					} else if (artist.lastfm?.mbid) {
						audiodbArtist = audiodbArtists.artists.find(a => artist.lastfm?.mbid && artist.lastfm?.mbid === a.strMusicBrainzID)
					}
					if (!audiodbArtist) {
						console.log(`Multiple artists found for ${artist.name}`)
						console.log(artistsJson.artists)
						resolveForId(input.id)
						return
					}
					
					const imageIds = await keysAndInputToImageIds(audiodbArtist, ['strArtistThumb', 'strArtistLogo', 'strArtistCutout', 'strArtistClearart', 'strArtistWideThumb', 'strArtistBanner'])
					await ctx.prisma.audioDbArtist.create({
						data: {
							entityId: input.id,
							...audiodbArtist,
							thumbId: imageIds.strArtistThumb,
							logoId: imageIds.strArtistLogo,
							cutoutId: imageIds.strArtistCutout,
							clearartId: imageIds.strArtistClearart,
							wideThumbId: imageIds.strArtistWideThumb,
							bannerId: imageIds.strArtistBanner,
						},
					})
					await new Promise(resolve => enqueue(() => resolve(undefined)))
					const albumsUrl = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/album.php`, 'https://theaudiodb.com')
					albumsUrl.searchParams.set('i', audiodbArtist.idArtist.toString())
					console.log(`fetching ${albumsUrl.toString()}`)
					const albumsData = await fetch(albumsUrl)
					const albumsJson = await albumsData.json()
					const audiodbAlbums = z.object({album: z.array(audiodbAlbumSchema)}).parse(albumsJson)
					for (const audiodbAlbum of audiodbAlbums.album) {
						const entityAlbum = artist.albums.find(a => a.lastfm?.mbid && a.lastfm?.mbid === audiodbAlbum.strMusicBrainzID)
						const imageIds = await keysAndInputToImageIds(audiodbAlbum, ['strAlbumThumb','strAlbumThumbHQ','strAlbumCDart'])
						await ctx.prisma.audioDbAlbum.create({
							data: {
								...(entityAlbum ? {entityId: entityAlbum.id} : {}),
								...audiodbAlbum,
								thumbId: imageIds.strAlbumThumb,
								thumbHqId: imageIds.strAlbumThumbHQ,
								cdArtId: imageIds.strAlbumCDart,
							},
						})
						await new Promise(resolve => enqueue(() => resolve(undefined)))
						const tracksUrl = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/track.php`, 'https://theaudiodb.com')
						tracksUrl.searchParams.set('m', audiodbAlbum.idAlbum.toString())
						console.log(`fetching ${tracksUrl.toString()}`)
						const tracksData = await fetch(tracksUrl)
						const tracksJson = await tracksData.json()
						const audiodbTracks = z.object({track: z.array(audiodbTrackSchema)}).parse(tracksJson)
						let oneAlbumConnection: string | undefined
						await Promise.all(audiodbTracks.track.map(async (audiodbTrack) => {
							const entityTrack = artist.tracks.find(t => t.lastfm?.mbid && t.lastfm?.mbid === audiodbTrack.strMusicBrainzID)
							if (!entityAlbum && !oneAlbumConnection && entityTrack?.albumId) {
								oneAlbumConnection = entityTrack.albumId
							}
							const imageIds = await keysAndInputToImageIds(audiodbTrack, ['strTrackThumb'])
							return ctx.prisma.audioDbTrack.create({
								data: {
									...(entityTrack ? {entityId: entityTrack.id} : {}),
									...audiodbTrack,
									thumbId: imageIds.strTrackThumb,
								},
							})
						}))
						if (oneAlbumConnection) {
							await ctx.prisma.audioDbAlbum.update({
								where: {idAlbum: audiodbAlbum.idAlbum},
								data: {
									entityId: oneAlbumConnection,
								},
							})
						}
					}
					resolveForId(input.id)
				})
			return false

			async function keysAndInputToImageIds<
				K extends readonly (keyof I)[],
				J extends K[keyof K] & string,
				I extends {[key in J]?: string | number | null | undefined} & {[key: string]: any},
				R extends {[key in keyof Pick<I, J>]: string}
			>(input: I, keys: K): Promise<R> {
				const imageIds = await Promise.allSettled(keys.map(async (key) => {
					const url = input[key]
					if (url) {
						const {hash, path, mimetype} = await fetchAndWriteImage(url as string)
						const {id} = await ctx.prisma.image.upsert({
						where: { id: hash },
						update: {},
						create: {
							id: hash as string,
							path,
							mimetype,
						}
						})
						return [key, id] as const
					}
				}))
				const fulfilled = imageIds.filter((result) => result.status === 'fulfilled') as PromiseFulfilledResult<[J, string] | undefined>[]
				const values = fulfilled.map(({value}) => value)
				const content = values.filter(Boolean) as [J, string][]
				return Object.fromEntries(content) as R
			}
		}
	})

function resolveForId(id: string) {
	const existing = callbacks.get(id)
	if (!existing) {
		return
	}
	for (const callback of existing) {
		callback()
	}
	callbacks.delete(id)
}

const queue = new Set<() => void>()

async function processQueue() {
	for (const callback of queue) {
		callback()
		await new Promise(resolve => setTimeout(resolve, 2000))
		queue.delete(callback)
	}
	if (queue.size > 0) {
		processQueue()
	}
}

function enqueue(callback: () => void) {
	queue.add(callback)
	if (queue.size === 1) {
		processQueue()
	}
}
