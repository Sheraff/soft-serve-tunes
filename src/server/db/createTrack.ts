import { access, stat } from "node:fs/promises"
import { basename, extname, relative } from "node:path"
import { IAudioMetadata, ICommonTagsResult, parseFile } from 'music-metadata'
import { writeImage } from "utils/writeImage"
import type { Prisma, Track } from "@prisma/client"
import { prisma } from "server/db/client"
import { env } from "env/server.mjs"
import type { PrismaClientInitializationError, PrismaClientKnownRequestError, PrismaClientRustPanicError, PrismaClientUnknownRequestError, PrismaClientValidationError } from "@prisma/client/runtime"
import { constants } from "node:fs"
import { lastFm } from "server/persistent/lastfm"
import { acoustId } from "server/persistent/acoustId"
import sanitizeString from "utils/sanitizeString"
import log from "utils/logger"
import retryable from "utils/retryable"

/*
ISSUES

fails a lot & is slooooow
prisma.track.update() 
code: 'P2002',
meta: { target: [ 'simplified', 'artistId', 'albumId' ] }
*/

type PrismaError = PrismaClientRustPanicError
	| PrismaClientValidationError
	| PrismaClientKnownRequestError
	| PrismaClientInitializationError
	| PrismaClientUnknownRequestError

export default async function createTrack(path: string, retries = 0): Promise<true | false | Track> {
	const stats = await stat(path)
	const relativePath = relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, path)
	const existingFile = await prisma.file.findUnique({ where: { ino: stats.ino } })
	const acoustidRetry = await prisma.fileToCreate.findUnique({ where: { path }, select: {path: true, count: true}})
	if (acoustidRetry) {
		await prisma.fileToCreate.delete(({where: {path}}))
	}
	if (existingFile) {
		if (path === existingFile.path) {
			return true
		}
		try {
			await access(existingFile.path, constants.F_OK)
			log("warn", "warn", "fswatcher", `trying to create a duplicate file, request ignored, keeping ${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, existingFile.path)}`)
			return false // true or false? is this "success file exists" or "failure track wasn't created"?
		} catch {
			log("info", "info", "fswatcher", `track already exists but file was missing, linking ${relativePath}`)
			await retryable(() =>
				prisma.file.update({
					where: { ino: stats.ino },
					data: { path },
				})
			)
			log("event", "event", "fswatcher", `linked to existing track ${relativePath}`)
		}
		return true
	}
	let _metadata: IAudioMetadata | undefined
	try {
		_metadata = await parseFile(path)
		if (!_metadata) {
			throw new Error("No metadata")
		}
	} catch {
		log("error", "error", "fswatcher", `could not parse metadata out of ${relativePath}, probably not a music file`)
		return false
	}
	const metadata = _metadata as IAudioMetadata

	let fingerprinted: Awaited<ReturnType<typeof acoustId.identify>> | null = null
	if (!acoustidRetry || acoustidRetry.count < 10) {
		try {
			fingerprinted = await acoustId.identify(path, metadata)
		} catch (e) {
			log("warn", "wait", "fswatcher", `could not fingerprint ${relativePath}, trying again later`)
			console.error(e)
			await tryAgainLater(path, acoustidRetry?.count)
			return false
		}
	}
	
	try {
		log("info", "info", "fswatcher", `adding new track from file ${relativePath}`)
		
		const name = (() => {
			if (fingerprinted?.title)
				return fingerprinted.title
			const uselessNameRegex = /^[0-9\s\-]*(track|piste)[0-9\s]*$/i
			if (metadata.common.title && !uselessNameRegex.test(metadata.common.title))
				return metadata.common.title
			return basename(path, extname(path))
		})()
	
		const position = metadata.common.track.no ?? undefined

		const imageData = metadata.common.picture?.[0]?.data
		const { hash, path: imagePath, palette } = imageData
			? await writeImage(Buffer.from(imageData), metadata.common.picture?.[0]?.format?.split('/')?.[1], `from createTrack ${name}`)
			: { hash: '', path: '', palette: '' }

		const [correctedArtist, isMultiArtistAlbum] = await (async () => {
			if (fingerprinted?.artists?.[0]) {
				const mainName = fingerprinted.artists[0].name
				const correctedMainName = (await lastFm.correctArtist(mainName)) || mainName
				if (fingerprinted.album?.artists?.[0]) {
					if (fingerprinted.album.artists[0].name !== mainName) {
						return [correctedMainName, true]
					}
				}
				return [correctedMainName, false]
			}
			return getArtist(metadata.common)
		})()

		const feats: ({name: string, id?: string})[] = (() => {
			if (fingerprinted?.artists) {
				return fingerprinted.artists.slice(1).map(({name, id}) => ({name, id}))
			}
			if (metadata.common.artists) {
				return metadata.common.artists?.filter(artist => artist !== metadata.common.artist).map((name) => ({name}))
			}
			return []
		})()

		const correctedFeats: ({name: string, id?: string})[] = []
		for (const feat of feats) {
			if (!feat.name) continue
			const correctedFeat = await lastFm.correctArtist(feat.name)
			if (correctedFeat) {
				correctedFeats.push({name: correctedFeat, id: feat.id})
			} else if (fingerprinted?.artists) {
				correctedFeats.push(feat)
			}
		}

		const correctedTrack = await (async () => {
			if (correctedArtist && name) {
				const correctedName = await lastFm.correctTrack(correctedArtist, name)
				return correctedName || name
			}
			return name
		})()

		const correctedAlbum = fingerprinted?.album?.title || metadata.common.album

		const genres = uniqueGenres(metadata.common.genre || [])

		const track = await retryable(() => prisma.track.create({
			include: {
				feats: {
					select: {
						id: true,
					}
				}
			},
			data: {
				name: correctedTrack,
				simplified: simplifiedName(correctedTrack),
				position,
				popularity: 0,
				year: metadata.common.year,
				mbid: fingerprinted?.id,
				file: {
					create: {
						path: path,
						size: stats.size,
						ino: stats.ino,
						container: metadata.format.container ?? '*',
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
								mimetype: metadata.common.picture?.[0]?.format ?? 'image/*',
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
					connectOrCreate: genres.map(({name, simplified}) => ({
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
		if (correctedAlbum) {
			const artistId = isMultiArtistAlbum ? undefined : track.artistId
			await linkAlbum(track.id, {
				name: correctedAlbum,
				simplified: simplifiedName(correctedAlbum),
				artistId,
				year: metadata.common.year,
				tracksCount: metadata.common.track.of,
				mbid: fingerprinted?.album?.id
			}, isMultiArtistAlbum)
		}
		log("event", "event", "fswatcher", `added ${relativePath}`)
		await tryAgainLater()
		return track
	} catch (e) {
		const error = e as PrismaError
		const RETRIES = 6
		if ('errorCode' in error && error.errorCode === 'P1008' && retries < RETRIES) {
			// wait to avoid race: random to stagger siblings, exponential to let the rest of the library go on
			const delay = 5 * Math.random() + 2 ** retries
			log("info", "wait", "fswatcher", `database is busy, retry #${retries + 1} in ${Math.round(delay)}ms for ${relativePath}`)
			await new Promise((resolve) => setTimeout(resolve, delay))
			return createTrack(path, retries + 1)
		} else {
			log("error", "error", "fswatcher", `failed to add ${relativePath} after ${retries} retries`)
			console.warn(error)
			return false
		}
	}
}

let retryTimeout: NodeJS.Timeout | null = null
async function tryAgainLater(path?: string, count = -1) {
	if (retryTimeout) clearTimeout(retryTimeout)
	if (path) {
		await retryable(() => prisma.fileToCreate.create({data: {path, count: count + 1}}))
	}
	const howManyLeft = await prisma.fileToCreate.count()
	if (howManyLeft) {
		retryTimeout = setTimeout(async () => {
			retryTimeout = null
			const items = await prisma.fileToCreate.findMany()
			for (const item of items) {
				log("info", "wait", "fswatcher", `retrying (#${item.count}) to create file ${item.path}`)
				await createTrack(item.path)
			}
		}, 120_000)
	}
}

export function simplifiedName(name: string) {
	return sanitizeString(name).toLowerCase().replace(/\s+/g, '')
}

export function uniqueGenres(genres: string[]) {
	const names = genres
		.flatMap((genre) => genre
			.split(/\/|,|;/)
			.map(name => name.trim())
		)
	const uniqueSimplifiedNames = new Set<string>()
	const filteredGenres = names.reduce<{
		simplified: string
		name: string
	}[]>((list, name) => {
		const simplified = simplifiedName(name)
		if (!uniqueSimplifiedNames.has(simplified)) {
			uniqueSimplifiedNames.add(simplified)
			list.push({ simplified, name })
		}
		return list
	}, [])
	return filteredGenres
}

export function isVariousArtists(name: string) {
	return [
		'variousartists',
		'various',
		'va',
		'artistesdivers',
	].includes(simplifiedName(name))
}

export function notArtistName(name: string) {
	return [
		'',
		'variousartists',
		'various',
		'va',
		'artistesdivers',
		'unknown',
		'unknownartist'
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

async function linkAlbum(id: string, create: Prisma.AlbumCreateArgs['data'], isMultiArtistAlbum: boolean) {
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
				data: { albumId: existingAlbum.id }
			}))
		}
	}
	if (create.artistId) {
		const {simplified, artistId} = create
		return retryable(() => prisma.track.update({
			where: { id },
			data: {
				album: {
					connectOrCreate: {
						where: {simplified_artistId: { simplified, artistId }},
						create,
					}
				}
			}
		}))
	}
	return retryable(() => prisma.track.update({
		where: { id },
		data: { album: { create }}
	}))
}