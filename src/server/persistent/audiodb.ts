import { socketServer } from "server/persistent/ws"
import { env } from "env/server.mjs"
import { z } from "zod"
import { fetchAndWriteImage } from "utils/writeImage"
import Queue from "utils/Queue"
import sanitizeString from "utils/sanitizeString"
import log from "utils/logger"
import { prisma } from "server/db/client"
import retryable from "utils/retryable"
import { uniqueGenres } from "server/db/createTrack"

const queue = new Queue(2000)

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

const running = new Set<string>()

type Endpoint = "search" | "album" | "track"

async function audiodbFetch(endpoint: Endpoint, ...params: [string, string][]) {
	const url = new URL(`/api/v1/json/${env.AUDIO_DB_API_KEY}/${endpoint}.php`, 'https://theaudiodb.com')
	params.forEach(([key, value]) => {
		url.searchParams.append(key, value)
	})
	return retryable(async () => {
		const response = await fetch(url)
		const json = await response.json()
		return json
	})
}

async function fetchArtist(id: string) {
	const existing = await prisma.audioDbArtist.findUnique({
		where: { entityId: id },
	})
	if (existing) {
		running.delete(id)
		return
	}
	if (running.has(id)) {
		running.delete(id)
		return
	}
	running.add(id)
	const artist = await prisma.artist.findUnique({
		where: { id },
		select: {
			id: true,
			name: true,
			audiodbDate: true,
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
	if (!artist) {
		running.delete(id)
		return
	}
	if (artist.audiodbDate && artist.audiodbDate.getTime() > new Date().getTime() - env.DAYS_BETWEEN_REFETCH) {
		return false
	}
	await retryable(() => (
		prisma.artist.update({
			where: { id },
			data: { audiodbDate: new Date().toISOString() },
		})
	))
	await queue.next()
	try {
		log("info", "fetch", "audiodb", `search: ${artist.name}`)
		const artistsJson = await audiodbFetch('search', ['s', sanitizeString(artist.name)])
		if (!artistsJson.artists || artistsJson.artists.length === 0) {
			log("warn", "404", "audiodb", `No artist found for ${artist.name}`)
			running.delete(id)
			return
		}
		const audiodbArtists = z.object({artists: z.array(audiodbArtistSchema)}).parse(artistsJson)
		let audiodbArtist: z.infer<typeof audiodbArtistSchema> | undefined = undefined
		if (audiodbArtists.artists.length === 1) {
			audiodbArtist = audiodbArtists.artists[0]
		} else if (artist.lastfm?.mbid) {
			audiodbArtist = audiodbArtists.artists.find(a => artist.lastfm?.mbid === a.strMusicBrainzID)
		}
		if (!audiodbArtist) {
			log("warn", "409", "audiodb", `Multiple artists found for ${artist.name}`)
			console.log(audiodbArtists.artists.map(a => a.strArtist).join(', '))
			running.delete(id)
			return
		}
		
		const imageIds = await keysAndInputToImageIds(audiodbArtist, ['strArtistThumb', 'strArtistLogo', 'strArtistCutout', 'strArtistClearart', 'strArtistWideThumb', 'strArtistBanner'])
		await retryable(async () => {
			if (audiodbArtist) {
				await prisma.audioDbArtist.create({
					data: {
						entityId: id,
						...audiodbArtist,
						thumbId: imageIds.strArtistThumb,
						logoId: imageIds.strArtistLogo,
						cutoutId: imageIds.strArtistCutout,
						clearartId: imageIds.strArtistClearart,
						wideThumbId: imageIds.strArtistWideThumb,
						bannerId: imageIds.strArtistBanner,
					},
				})
			}
		})
		socketServer.send("invalidate:artist", {id: id})
		await queue.next()
		log("info", "fetch", "audiodb", `albums: ${audiodbArtist.strArtist}`)
		const albumsJson = await audiodbFetch('album', ['i', audiodbArtist.idArtist.toString()])
		if (!albumsJson.album || albumsJson.album.length === 0) {
			log("warn", "404", "audiodb", `No albums found for ${audiodbArtist.strArtist}`)
			running.delete(id)
			return
		}
		const audiodbAlbums = z.object({album: z.array(audiodbAlbumSchema)}).parse(albumsJson)
		for (const audiodbAlbum of audiodbAlbums.album) {
			try {
				const entityAlbum = artist.albums.find(a => a.lastfm?.mbid && a.lastfm?.mbid === audiodbAlbum.strMusicBrainzID)
				const imageIds = await keysAndInputToImageIds(audiodbAlbum, ['strAlbumThumb','strAlbumThumbHQ','strAlbumCDart'])
				await retryable(async () => {
					await prisma.audioDbAlbum.create({
						data: {
							...(entityAlbum ? {entityId: entityAlbum.id} : {}),
							...audiodbAlbum,
							thumbId: imageIds.strAlbumThumb,
							thumbHqId: imageIds.strAlbumThumbHQ,
							cdArtId: imageIds.strAlbumCDart,
						},
					})
				})
				if (entityAlbum) {
					socketServer.send("invalidate:album", {id: entityAlbum.id})
				}
				await queue.next()
				log("info", "fetch", "audiodb", `tracks: ${audiodbAlbum.strAlbum}`)
				const tracksJson = await audiodbFetch('track', ['m', audiodbAlbum.idAlbum.toString()])
				if (!tracksJson.track || tracksJson.track.length === 0) {
					log("warn", "404", "audiodb", `No tracks found for ${audiodbArtist.strArtist} - ${audiodbAlbum.strAlbum}`)
					continue
				}
				const audiodbTracks = z.object({track: z.array(audiodbTrackSchema)}).parse(tracksJson)
				let oneAlbumConnection: string | undefined
				await Promise.allSettled(audiodbTracks.track.map(async (data) => {
					const {strGenre, ...audiodbTrack} = data
					const genres = uniqueGenres(strGenre ? [strGenre] : [])
					const entityTrack = artist.tracks.find(t => t.lastfm?.mbid && t.lastfm?.mbid === audiodbTrack.strMusicBrainzID)
					if (!entityAlbum && !oneAlbumConnection && entityTrack?.albumId) {
						oneAlbumConnection = entityTrack.albumId
					}
					const imageIds = await keysAndInputToImageIds(data, ['strTrackThumb'])
					await retryable(async () => {
						await prisma.audioDbTrack.create({
							data: {
								...(entityTrack ? {entityId: entityTrack.id} : {}),
								...audiodbTrack,
								genres: {
									connectOrCreate: genres.map(({name, simplified}) => ({
										where: { simplified },
										create: { name, simplified }
									}))
								},
								thumbId: imageIds.strTrackThumb,
							},
						})
					})
					if (entityTrack) {
						socketServer.send("invalidate:track", {id: entityTrack.id})
					}
				}))
				if (oneAlbumConnection) {
					await prisma.audioDbAlbum.update({
						where: { idAlbum: audiodbAlbum.idAlbum },
						data: {
							entityId: oneAlbumConnection,
						},
					})
				}
			} catch (e) {
				console.error(e)
				// catching error because if 1 album fails, it shouldn't prevent the other ones to proceed
			}
		}
	} catch (error) {
		// catching fo that a running album that errors is still removed from `running`
		running.delete(id)
	}
}

async function keysAndInputToImageIds<
	AllKeys extends readonly (keyof Input)[],
	Key extends AllKeys[keyof AllKeys] & string,
	Input extends {[key in Key]?: string | number | null | undefined} & {[key in Exclude<string, Key>]: unknown},
	Result extends {[key in keyof Pick<Input, Key>]: string}
>(input: Input, keys: AllKeys): Promise<Result> {
	const imageIds = await Promise.allSettled(keys.map(async (key) => {
		const url = input[key]
		if (url) {
			const {hash, path, mimetype, palette} = await fetchAndWriteImage(url as string)
			if (hash) {
				const {id} = await prisma.image.upsert({
					where: { id: hash },
					update: {},
					create: {
						id: hash as string,
						path,
						mimetype,
						palette,
					}
				})
				return [key, id] as const
			}
		}
	}))
	const fulfilled = imageIds.filter((result) => result.status === 'fulfilled') as PromiseFulfilledResult<[Key, string] | undefined>[]
	const values = fulfilled.map(({value}) => value)
	const content = values.filter(Boolean) as [Key, string][]
	return Object.fromEntries(content) as Result
}

export const audiodb = {
	fetchArtist
}