import { access, stat, readdir } from "node:fs/promises"
import { type Stats } from "node:fs"
import { basename, extname, dirname, relative, join } from "node:path"
import { IAudioMetadata, ICommonTagsResult, parseFile, selectCover } from "music-metadata"
import { writeImage } from "utils/writeImage"
import type { Prisma, Track } from "@prisma/client"
import { prisma } from "server/db/client"
import { env } from "env/server.mjs"
import type { PrismaClientInitializationError, PrismaClientKnownRequestError, PrismaClientRustPanicError, PrismaClientUnknownRequestError, PrismaClientValidationError } from "@prisma/client/runtime"
import { constants } from "node:fs"
import { lastFm } from "server/persistent/lastfm"
import { acoustId } from "server/persistent/acoustId"
import { cleanGenreList, simplifiedName } from "utils/sanitizeString"
import log from "utils/logger"
import retryable from "utils/retryable"
import { computeTrackCover } from "./computeCover"
import { socketServer } from "utils/typedWs/server"
import similarStrings from "utils/similarStrings"

type PrismaError = PrismaClientRustPanicError
	| PrismaClientValidationError
	| PrismaClientKnownRequestError
	| PrismaClientInitializationError
	| PrismaClientUnknownRequestError

export default async function createTrack(path: string, retries = 0): Promise<true | false | Track> {
	const relativePath = relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, path)

	const acoustidRetry = await prisma.fileToCreate.findUnique({ where: { path: relativePath }, select: { path: true, count: true } })
	if (acoustidRetry) {
		await prisma.fileToCreate.delete(({ where: { path: relativePath } }))
	}

	let stats: Stats
	try {
		stats = await stat(path)
	} catch (error) {
		log("error", "error", "fswatcher", `could not stat file ${relativePath}, it might have been removed while it was still being processed`)
		return false
	}

	const existingFile = await prisma.file.findUnique({ where: { ino: stats.ino } })
	if (existingFile) {
		if (relativePath === existingFile.path) {
			return true
		}
		try {
			await access(join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, existingFile.path), constants.F_OK)
			log("warn", "warn", "fswatcher", `trying to create a duplicate file, request ignored, keeping ${existingFile.path}`)
			return false // true or false? is this "success file exists" or "failure track wasn't created"?
		} catch {
			log("info", "info", "fswatcher", `track already exists but file was missing, linking ${relativePath}`)
			await retryable(() =>
				prisma.file.update({
					where: { ino: stats.ino },
					data: { path: relativePath },
				})
			)
			log("event", "event", "fswatcher", `linked to existing track ${relativePath}`)
		}
		return true
	}
	let _metadata: IAudioMetadata | undefined
	try {
		_metadata = await parseFile(path, { duration: true })
		if (!_metadata) {
			throw new Error("No metadata")
		}
	} catch {
		log("error", "error", "fswatcher", `could not parse metadata out of ${relativePath}, probably not a music file`)
		return false
	}
	const metadata = _metadata as IAudioMetadata

	{
		const copy = await prisma.file.findUnique({ where: { path: relativePath } })
		if (copy) {
			// we should make sure this is the same file based on: size, container
			const isSameFile = copy.size === stats.size
				&& copy.container === (metadata.format.container ?? "*")
			if (isSameFile) {
				log("info", "info", "fswatcher", `found existing file with same path, same size, same container, but different ino for ${relativePath}, updating ino to ${stats.ino}`)
				await retryable(() =>
					prisma.file.update({
						where: { path: relativePath },
						data: { ino: stats.ino },
					})
				)
				log("event", "event", "fswatcher", `updated ino for existing file ${relativePath}`)
				return true
			}
		}
	}
	// get info from context if missing from _metadata
	// if (!relativePath.includes('__soft-served')) {
	// 	const [metaArtist, metaAlbumIsMultiArtist] = await getArtist(_metadata.common)
	// 	const missingMetaAlbum = !_metadata.common.album
	// 	const missingMetaArtist = !metaArtist && !metaAlbumIsMultiArtist
	// 	if (missingMetaAlbum || missingMetaArtist) {
	// 		const siblingTracks = await prisma.track.findMany({
	// 			where: {
	// 				file: { path: { startsWith: dirname(relativePath) }},
	// 			},
	// 			select: {
	// 				mbid: true,
	// 				artist: { select: { name: true }},
	// 				album: { select: { name: true }},
	// 			}
	// 		})
	// 		const acoustidRetryCount = acoustidRetry?.count ?? 0
	// 		if (siblingTracks.length <= 2 && (acoustidRetryCount) <= 2) {
	// 			await tryAgainLater(path, acoustidRetryCount)
	// 			return false
	// 		}
	// 		if (siblingTracks.length > 2) {
	// 			const [artists, albums] = siblingTracks.reduce((maps, track) => {
	// 				const [artists, albums] = maps
	// 				if (track.artist?.name)
	// 					artists.set(track.artist.name, (artists.get(track.artist.name) || 0) + 1)
	// 				if (track.album?.name)
	// 					albums.set(track.album.name, (albums.get(track.album.name) || 0) + 1)
	// 				return [artists, albums]
	// 			}, [new Map<string, number>(), new Map<string, number>()] as const)
	// 			if (missingMetaAlbum) {
	// 				const [name, count] = Array.from(albums.entries()).reduce((prev, curr) => {
	// 					return curr[1] > prev[1] ? curr : prev
	// 				}, ['', 0] as [string, number])
	// 				if (name && count > 2) {
	// 					_metadata.common.album = name
	// 				}
	// 			}
	// 			if (missingMetaArtist) {
	// 				const [name, count] = Array.from(artists.entries()).reduce((prev, curr) => {
	// 					return curr[1] > prev[1] ? curr : prev
	// 				}, ['', 0] as [string, number])
	// 				if (name && count > 2) {
	// 					_metadata.common.artist = name
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	let fingerprinted: Awaited<ReturnType<typeof acoustId.identify>> | null = null
	if (!acoustidRetry || acoustidRetry.count < 10) {
		try {
			fingerprinted = await acoustId.identify(path, metadata, acoustidRetry?.count)
		} catch (e) {
			log("warn", "wait", "acoustid", `could not fingerprint ${relativePath}, trying again later`)
			if (typeof e === "string") {
				log("error", "wait", "acoustid", e) // ERROR: Error decoding audio frame (Invalid data found when processing input)
			} else {
				console.error(e)
			}
			await tryAgainLater(path, acoustidRetry?.count)
			return false
		}
	}

	try {
		log("info", "info", "fswatcher", `adding new track from file ${relativePath}`)

		const name = (() => {
			if (fingerprinted?.title)
				return fingerprinted.title
			const uselessNameRegex = /^[0-9\s\-\/]*(track|piste|plage|audiotrack)[0-9\s]*$/i
			if (metadata.common.title && !uselessNameRegex.test(metadata.common.title))
				return metadata.common.title
			return basename(path, extname(path))
		})()

		const position = fingerprinted?.no ?? metadata.common.track.no ?? undefined

		const selectedCover = selectCover(metadata.common.picture)
		const { hash, path: imagePath, palette } = selectedCover && selectedCover.data.byteLength
			? await writeImage(Buffer.from(selectedCover.data), selectedCover.format.split("/")[1], `from createTrack ${name}`)
			: { hash: "", path: "", palette: undefined }

		const [correctedArtist, isMultiArtistAlbum] = await (async () => {
			if (fingerprinted?.artists?.[0]) {
				const mainName = fingerprinted.artists[0].name
				const lastfmName = await lastFm.correctArtist(mainName)
				const correctedMainName = lastfmName && similarStrings(mainName, lastfmName)
					? lastfmName
					: mainName
				if (fingerprinted.album?.artists?.[0]) {
					if (fingerprinted.album.artists[0].name !== mainName) {
						return [correctedMainName, true]
					}
				}
				return [correctedMainName, false]
			}
			return getArtist(metadata.common)
		})()

		const feats: ({ name: string, id?: string })[] = (() => {
			if (fingerprinted?.artists) {
				return fingerprinted.artists.slice(1).map(({ name, id }) => ({ name, id }))
			}
			if (metadata.common.artists) {
				return metadata.common.artists?.filter(artist => artist !== metadata.common.artist).map((name) => ({ name }))
			}
			return []
		})()

		const correctedFeats: ({ name: string, id?: string })[] = []
		for (const feat of feats) {
			if (!feat.name) continue
			const lastfmName = await lastFm.correctArtist(feat.name)
			const correctedFeat = lastfmName && similarStrings(feat.name, lastfmName)
				? lastfmName
				: feat.name
			if (correctedFeat) {
				correctedFeats.push({ name: correctedFeat, id: feat.id })
			} else if (fingerprinted?.artists) {
				correctedFeats.push(feat)
			}
		}

		const correctedTrack = await (async () => {
			if (correctedArtist && name) {
				const lastfmName = await lastFm.correctTrack(correctedArtist, name)
				const correctedName = lastfmName && similarStrings(name, lastfmName)
					? lastfmName
					: name
				return correctedName
			}
			return name
		})()

		const correctedAlbum = fingerprinted?.album?.title || metadata.common.album

		const baseGenres = []
		if (metadata.common.genre) baseGenres.push(...metadata.common.genre)
		if (fingerprinted?.genres) baseGenres.push(...fingerprinted.genres.map(({ name }) => name))
		const genres = cleanGenreList(baseGenres)

		const baseArtistGenres = []
		if (fingerprinted?.artists?.[0]?.genres) baseArtistGenres.push(...fingerprinted.artists[0].genres.map(({ name }) => name))
		const artistGenres = cleanGenreList(baseArtistGenres)

		const track = await retryable(() => prisma.track.create({
			include: {
				feats: {
					select: {
						id: true,
						mbid: true,
					}
				}
			},
			data: {
				name: correctedTrack,
				simplified: simplifiedName(correctedTrack),
				position,
				metaPosition: position,
				year: metadata.common.year,
				mbid: fingerprinted?.id,
				file: {
					create: {
						path: relativePath,
						size: stats.size,
						ino: stats.ino,
						container: metadata.format.container ?? "*",
						duration: metadata.format.duration ?? fingerprinted?.duration ?? 0,
						updatedAt: new Date(stats.mtimeMs),
						createdAt: new Date(stats.ctimeMs),
						birthTime: new Date(stats.birthtime),
					}
				},
				...(hash && imagePath ? {
					metaImage: {
						connectOrCreate: {
							where: { id: hash },
							create: {
								id: hash,
								path: imagePath,
								mimetype: metadata.common.picture?.[0]?.format ?? "image/*",
								palette,
							}
						}
					}
				} : {}),
				...(correctedArtist ? {
					artist: {
						connectOrCreate: {
							where: {
								simplified: simplifiedName(correctedArtist),
							},
							create: {
								name: correctedArtist,
								simplified: simplifiedName(correctedArtist),
								mbid: fingerprinted?.artists?.[0]?.id,
								genres: {
									connectOrCreate: artistGenres.map(({ name, simplified }) => ({
										where: { simplified },
										create: { name, simplified }
									}))
								}
							}
						}
					}
				} : {}),
				feats: {
					connectOrCreate: correctedFeats.map(artist => ({
						where: {
							simplified: simplifiedName(artist.name),
						},
						create: {
							name: artist.name,
							simplified: simplifiedName(artist.name),
							mbid: artist.id,
						}
					}))
				},
				genres: {
					connectOrCreate: genres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				}
			}
		}))

		// update `feats` on secondary artists
		if (correctedFeats.length) {
			await Promise.allSettled(track.feats.map(feat => {
				return retryable(() => prisma.artist.update({
					where: {
						id: feat.id,
					},
					data: {
						feats: {
							connect: {
								id: track.id,
							}
						}
					},
				}))
			}))
		}


		// create album now that we have an artistId
		let linkedAlbum: Awaited<ReturnType<typeof linkAlbum>> | null = null
		if (correctedAlbum) {
			const artistId = await (async () => {
				// avoid cases where an album is created in duplicates because a single (or a few) track was from a different artist
				const mainArtistMbidCandidate = fingerprinted?.album?.artists?.[0]
				if (mainArtistMbidCandidate && fingerprinted?.artists?.[0]?.id !== mainArtistMbidCandidate.id && !notArtistName(mainArtistMbidCandidate.name)) {
					const featAsMainAlbumArtist = track.feats.find(({ mbid }) => mbid === mainArtistMbidCandidate.id)
					if (featAsMainAlbumArtist?.id)
						return featAsMainAlbumArtist.id
					const existingMainAlbumArtist = await retryable(() => prisma.artist.findFirst({
						where: { mbid: mainArtistMbidCandidate.id },
						select: { id: true }
					}))
					if (existingMainAlbumArtist)
						return existingMainAlbumArtist.id
				}
				return isMultiArtistAlbum ? undefined : (track.artistId ?? undefined)
			})()

			const baseAlbumGenres = []
			if (fingerprinted?.album?.genres) baseAlbumGenres.push(...fingerprinted.album.genres.map(({ name }) => name))
			const albumGenres = cleanGenreList(baseAlbumGenres)

			linkedAlbum = await linkAlbum(track.id, {
				name: correctedAlbum,
				simplified: simplifiedName(correctedAlbum),
				artistId,
				year: metadata.common.year,
				tracksCount: fingerprinted?.of ?? metadata.common.track.of ?? undefined,
				mbid: fingerprinted?.album?.id,
				genres: {
					connectOrCreate: albumGenres.map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				}
			}, isMultiArtistAlbum)
		}
		log("event", "event", "fswatcher", `added ${relativePath}`)
		await computeTrackCover(track.id, { album: true, artist: true })
		socketServer.emit("add", { type: "track", id: track.id })
		if (track.artistId) socketServer.emit("add", { type: "artist", id: track.artistId })
		const albumId = track.albumId ?? linkedAlbum?.albumId
		if (albumId) socketServer.emit("add", { type: "album", id: albumId })
		await tryAgainLater()
		return track
	} catch (e) {
		const error = e as PrismaError
		const RETRIES = 6
		if ("errorCode" in error && error.errorCode === "P1008" && retries < RETRIES) {
			// wait to avoid race: random to stagger siblings, exponential to let the rest of the library go on
			const delay = 5 * Math.random() + 2 ** retries
			log("info", "wait", "fswatcher", `database is busy, retry #${retries + 1} in ${Math.round(delay)}ms for ${relativePath}`)
			await new Promise((resolve) => setTimeout(resolve, delay))
			return createTrack(path, retries + 1)
		} else {
			log("error", "error", "fswatcher", `failed to add ${relativePath} after ${retries} retries`)
			console.log("error keys", ...Array.from(Object.keys(error))) // code, clientVersion, meta
			// P2002 => Unique constraint failed on the fields (prisma.track.update / target: [ 'simplified', 'artistId', 'albumId' ])
			console.error(error)
			return false
		}
	}
}

let retryTimeout: NodeJS.Timeout | null = null
export async function tryAgainLater(path?: string, count = -1) {
	if (retryTimeout) clearTimeout(retryTimeout)
	if (path) {
		const relativePath = relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, path)
		await retryable(() => prisma.fileToCreate.create({ data: { path: relativePath, count: count + 1 } }))
	}
	const howManyLeft = await prisma.fileToCreate.count()
	if (howManyLeft) {
		retryTimeout = setTimeout(async () => {
			retryTimeout = null
			const items = await prisma.fileToCreate.findMany()
			for (const item of items) {
				log("info", "wait", "fswatcher", `retrying (#${item.count}) to create file ${item.path}`)
				const absolutePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, item.path)
				await createTrack(absolutePath)
			}
		}, 180_000)
	}
}

export function isVariousArtists(name: string) {
	return [
		"variousartists",
		"various",
		"va",
		"artistesdivers",
	].includes(simplifiedName(name))
}

export function notArtistName(name: string) {
	return [
		"",
		"variousartists",
		"various",
		"va",
		"artistesdivers",
		"unknown",
		"unknownartist"
	].includes(simplifiedName(name))
}

async function getArtist(common: ICommonTagsResult): Promise<[string | undefined, boolean]> {
	const isVarious = common.albumartist
		? isVariousArtists(common.albumartist)
		: false
	if (common.albumartist && !isVarious && !notArtistName(common.albumartist)) {
		const foundArtist = await lastFm.correctArtist(common.albumartist)
		if (foundArtist) return [foundArtist, false]
	}
	if (common.artist && !notArtistName(common.artist)) {
		const foundArtist = await lastFm.correctArtist(common.artist)
		if (foundArtist) return [foundArtist, isVarious]
		return [common.artist, isVarious]
	}
	return [undefined, isVarious]
}

async function linkAlbum(id: string, create: Prisma.AlbumCreateArgs["data"], isMultiArtistAlbum: boolean) {
	if (isMultiArtistAlbum) {
		const existingAlbum = await retryable(() => prisma.album.findFirst({
			where: {
				simplified: create.simplified,
				artist: null,
			}
		}))
		if (existingAlbum) {
			return retryable(() => prisma.track.update({
				where: { id },
				data: { albumId: existingAlbum.id },
				select: { albumId: true },
			}))
		}
	}
	if (create.artistId) {
		const { simplified, artistId } = create
		return retryable(() => prisma.track.update({
			where: { id },
			data: {
				album: {
					connectOrCreate: {
						where: { simplified_artistId: { simplified, artistId } },
						create,
					}
				}
			},
			select: { albumId: true },
		}))
	}
	return retryable(() => prisma.track.update({
		where: { id },
		data: { album: { create } },
		select: { albumId: true },
	}))
}