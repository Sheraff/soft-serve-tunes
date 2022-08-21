import { access, stat } from "node:fs/promises"
import { basename, extname, relative } from "node:path"
import { IAudioMetadata, parseFile } from 'music-metadata'
import { writeImage } from "../../utils/writeImage"
import type { Prisma, Track } from "@prisma/client"
import { prisma } from "../db/client"
import { env } from "../../env/server.mjs"
import type { PrismaClientInitializationError, PrismaClientKnownRequestError, PrismaClientRustPanicError, PrismaClientUnknownRequestError, PrismaClientValidationError } from "@prisma/client/runtime"
import { constants } from "node:fs"
import { lastFm } from "../persistent/lastfm"
import { correctAlbum } from "../persistent/spotify"
import sanitizeString from "../../utils/sanitizeString"

type PrismaError = PrismaClientRustPanicError
	| PrismaClientValidationError
	| PrismaClientKnownRequestError
	| PrismaClientInitializationError
	| PrismaClientUnknownRequestError

export default async function createTrack(path: string, retries = 0): Promise<true | false | Track> {
	const stats = await stat(path)
	const relativePath = relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, path)
	const existingFile = await prisma.file.findUnique({ where: { ino: stats.ino } })
	if (existingFile) {
		if (path === existingFile.path) {
			return true
		}
		try {
			await access(existingFile.path, constants.F_OK)
			console.log(`\x1b[36mwarn \x1b[0m - trying to create a duplicate file, request ignored, keeping ${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, existingFile.path)}`)
			return false // true or false? is this success file exists or failure track wasn't created?
		} catch {
			console.log(`\x1b[36minfo \x1b[0m - track already exists but file was missing, linking ${relativePath}`)
			await prisma.file.update({
				where: { ino: stats.ino },
				data: { path },
			})
			console.log(`\x1b[35mevent\x1b[0m - linked to existing track ${relativePath}`)
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
		console.log(`\x1b[31merror\x1b[0m - could not parse ${relativePath}, probably not a music file`)
		return false
	}
	const metadata = _metadata as IAudioMetadata
	const uselessNameRegex = /^[0-9\s]*(track|piste)[0-9\s]*$/i
	const name = metadata.common.title && !uselessNameRegex.test(metadata.common.title)
		? metadata.common.title
		: basename(path, extname(path))

	const position = metadata.common.track.no ?? undefined

	try {
		console.log(`\x1b[36minfo \x1b[0m - adding new track from file ${relativePath}`)
		const imageData = metadata.common.picture?.[0]?.data
		const { hash, path: imagePath, palette } = imageData
			? await writeImage(Buffer.from(imageData), metadata.common.picture?.[0]?.format?.split('/')?.[1])
			: { hash: '', path: '', palette: '' }
		const feats = metadata.common.artists?.filter(artist => artist !== metadata.common.artist) || []

		const correctedArtist = metadata.common.artist
			? await lastFm.correctArtist(metadata.common.artist)
			: undefined
		const correctedFeats = []
		for (const feat of feats) {
			const correctedFeat = await lastFm.correctArtist(feat)
			if (correctedFeat) {
				correctedFeats.push(correctedFeat)
			}
		}

		const correctedTrack = correctedArtist && name
			? await lastFm.correctTrack(correctedArtist, name)
			: name

		const correctedAlbum = metadata.common.album
		// const correctedAlbum = metadata.common.album && correctedArtist
		// 	? await correctAlbum(correctedArtist, metadata.common.album, correctedTrack)
		// 	: undefined

		const track = await prisma.track.create({
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
				file: {
					create: {
						path: path,
						size: stats.size,
						ino: stats.ino,
						container: metadata.format.container ?? '*',
						duration: metadata.format.duration ?? 0,
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
							}
						}
					}
				} : {}),
				feats: {
					connectOrCreate: correctedFeats.map(artist => ({
						where: {
							simplified: simplifiedName(artist),
						},
						create: {
							name: artist,
							simplified: simplifiedName(artist),
						}
					}))
				},
				...(metadata.common.genre?.length ? {
					genres: {
						connectOrCreate: metadata.common.genre.map(genre => ({
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

		// update `feats` on secondary artists
		if (correctedFeats.length) {
			await Promise.allSettled(track.feats.map(feat => {
				return prisma.artist.update({
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
				})
			}))
		}

		// create album now that we have an artistId
		if (correctedAlbum) {
			const create: Prisma.AlbumCreateArgs['data'] = {
				name: correctedAlbum,
				simplified: simplifiedName(correctedAlbum),
				artistId: track.artistId,
				year: metadata.common.year,
				tracksCount: metadata.common.track.of,
			}
			if (track.artistId) {
				await prisma.track.update({
					where: {
						id: track.id,
					},
					data: {
						album: {
							connectOrCreate: {
								where: {
									simplified_artistId: {
										simplified: simplifiedName(correctedAlbum),
										artistId: track.artistId
									}
								},
								create
							}
						}
					}
				})
			} else {
				await prisma.track.update({
					where: {
						id: track.id,
					},
					data: {
						album: {
							create
						}
					}
				})
			}
		}
		console.log(`\x1b[35mevent\x1b[0m - added ${relativePath}`)
		return track
	} catch (e) {
		const error = e as PrismaError
		const RETRIES = 6
		if ('errorCode' in error && error.errorCode === 'P1008' && retries < RETRIES) {
			// wait to avoid race: random to stagger siblings, exponential to let the rest of the library go on
			const delay = 5 * Math.random() + 2 ** retries
			console.log(`\x1b[36mwait \x1b[0m - database is busy, retry #${retries + 1} in ${Math.round(delay)}ms for ${relativePath}`)
			await new Promise((resolve) => setTimeout(resolve, delay))
			return createTrack(path, retries + 1)
		} else {
			console.log(`\x1b[31merror\x1b[0m - failed to add ${relativePath} after ${retries} retries`)
			console.warn(error)
			return false
		}
	}
}

export function simplifiedName(name: string) {
	return sanitizeString(name).toLowerCase().replace(/\s+/g, '')
}