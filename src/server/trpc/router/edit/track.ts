import { router, protectedProcedure, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { type Prisma } from "@prisma/client"
import { prisma } from "server/db/client"
import { TRPCError } from "@trpc/server"
import { cleanGenreList, simplifiedName } from "utils/sanitizeString"
// import { lastFm } from "server/persistent/lastfm"
import { acoustId } from "server/persistent/acoustId"
import { parseFile, type IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"
import { socketServer } from "utils/typedWs/server"
import { fileWatcher } from "server/persistent/watcher"
import { unlink } from "fs/promises"
import log from "utils/logger"
import { join } from "path"
import { env } from "env/server.mjs"

// TODO: handle multi-artist album (both when linking and creating)
// TODO: maybe now disconnected album isn't multi-artist anymore?

const trackInputSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	coverId: z.string().optional(),
	album: z.object({
		id: z.string().optional(),
		name: z.string(),
	}).optional(),
	artist: z.object({
		id: z.string().optional(),
		name: z.string(),
	}).optional(),
	position: z.number().optional(),
})

type Input = z.infer<typeof trackInputSchema>

async function getTrack(input: { id: string }) {
	const track = await prisma.track.findUnique({
		where: { id: input.id },
		select: {
			id: true,
			name: true,
			coverId: true,
			position: true,
			mbid: true,
			album: {
				select: {
					id: true,
					name: true,
				}
			},
			artist: {
				select: {
					id: true,
					name: true,
				}
			},
			file: {
				select: {
					path: true,
					duration: true,
				}
			},
			userData: {
				select: {
					playcount: true,
					favorite: true,
				}
			},
			spotify: { select: { id: true } },
			lastfm: { select: { id: true } },
			audiodb: { select: { entityId: true } },
		}
	})
	if (!track) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Track ${input.id} not found`,
		})
	}
	if (!track.file) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Track ${input.id} (${track.name}) has no associated file`,
		})
	}
	return track as Omit<typeof track, "file"> & {
		file: Exclude<typeof track["file"], null>
	}
}

type Track = Awaited<ReturnType<typeof getTrack>>

async function getCover(input: Input, track: Track) {
	if (input.coverId && track.coverId !== input.coverId) {
		const cover = await prisma.image.findUnique({
			where: { id: input.coverId },
			select: { id: true },
		})
		if (!cover) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `Cover ${input.coverId} not found`,
			})
		}
		return cover
	}
}

async function getArtist(input: Input) {
	if (input.artist?.id) {
		const artist = await prisma.artist.findUnique({
			where: { id: input.artist.id },
			select: { id: true, name: true },
		})
		if (!artist) throw new TRPCError({
			code: "NOT_FOUND",
			message: `Artist ${input.artist.id} (${input.artist.name}) not found`,
		})
		return artist
	}
	if (input.artist?.name) {
		const artist = await prisma.artist.findFirst({
			where: {
				simplified: simplifiedName(input.artist.name),
			},
			select: { id: true, name: true },
		})
		return artist ?? undefined
	}
}

async function getAlbum(input: Input, track: Track, artist: Awaited<ReturnType<typeof getArtist>>) {
	if (input.album?.id) {
		const album = await prisma.album.findUnique({
			where: { id: input.album.id },
			select: { id: true, name: true },
		})
		if (!album) throw new TRPCError({
			code: "NOT_FOUND",
			message: `Album ${input.album.id} (${input.album.name}) not found`,
		})
		return album
	}
	// the second condition here is for the following case: we changed the artist name, and the new artist has an album of the same name
	if (input.album?.name || (artist && track.album?.name)) {
		const album = await prisma.album.findFirst({
			where: {
				simplified: simplifiedName(input.album?.name || track.album!.name),
				artistId: artist?.id ?? track.artist?.id,
			},
			select: { id: true, name: true },
		})
		return album ?? undefined
	}
}

async function getName(input: Input, track: Track, artist: Awaited<ReturnType<typeof getArtist>>) {
	if (!input.name) return
	// const artistName = artist?.name ?? input.artist?.name ?? track.artist?.name
	// if (artistName) {
	// 	const correctedName = await lastFm.correctTrack(artistName, input.name)
	// 	return correctedName
	// }
	return input.name
}

async function checkNameConflict(
	input: Input,
	track: Track,
	name: Awaited<ReturnType<typeof getName>>,
	artist: Awaited<ReturnType<typeof getArtist>>,
	album: Awaited<ReturnType<typeof getAlbum>>,
) {
	if (name || artist || album) {
		const other = await prisma.track.count({
			where: {
				simplified: simplifiedName(name || track.name),
				id: { not: input.id },
				artistId: artist?.id ?? (input.artist ? undefined : track.artist?.id),
				albumId: album?.id ?? (input.album ? undefined : track.album?.id),
			},
		})
		if (other > 0) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Track "${input.name || track.name}" already exists for artist "${artist?.name ?? input.artist?.name ?? track.artist?.name}" and album "${album?.name ?? input.album?.name ?? track.album?.name}"`,
			})
		}
	}
}

async function getFingerprinted(
	input: Input,
	track: Track,
	name: Awaited<ReturnType<typeof getName>>,
	album: Awaited<ReturnType<typeof getAlbum>>,
	artist: Awaited<ReturnType<typeof getArtist>>,
	metadata: IAudioMetadata
) {
	// if none of [name, artist, album] has changed, keep the same mbid
	if (!input.name && !input.artist && !input.album) {
		return undefined
	}
	metadata.format = {
		...metadata.format,
		duration: track.file.duration ?? metadata.format.duration,
	}
	metadata.common = {
		...metadata.common,
		title: name || track.name || metadata.common.title,
		artist: artist?.name || input.artist?.name || track.artist?.name || metadata.common.artist,
		album: album?.name || input.album?.name || track.album?.name || metadata.common.album,
	}

	let fingerprinted: Awaited<ReturnType<typeof acoustId.identify>> | null = null
	let retry = 0
	const retries = 10
	const absolutePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, track.file.path)
	while (!fingerprinted && retry < retries) {
		try {
			fingerprinted = await acoustId.identify(absolutePath, metadata, retry)
			break
		} catch (e) {
			if (typeof e === "string") {
				log("warn", "wait", "acoustid", e) // ERROR: Error decoding audio frame (Invalid data found when processing input)
			} else {
				console.error(e)
			}
			retry++
			if (retry >= retries) break
			log("warn", "wait", "acoustid", `could not fingerprint ${track.file.path}, trying again later`)
			await new Promise(resolve => setTimeout(resolve, 2 ** retry * 100))
		}
	}
	if (!fingerprinted || !fingerprinted.title) return null

	const sameName = similarStrings(fingerprinted.title, metadata.common.title!)
	if (!sameName) return null

	if (metadata.common.artist) {
		if (!fingerprinted.artists?.[0]?.name) return null
		const sameArtist = similarStrings(fingerprinted.artists?.[0]?.name, metadata.common.artist)
		if (!sameArtist) return null
	}

	if (metadata.common.album) {
		if (!fingerprinted.album?.title) return null
		const sameAlbum = similarStrings(fingerprinted.album.title, metadata.common.album)
		if (!sameAlbum) return null
	}

	return fingerprinted
}

const modify = protectedProcedure.input(trackInputSchema).mutation(async ({ input, ctx }) => {
	const track = await getTrack(input)

	// validate cover id
	await getCover(input, track)

	// validate artist (id or name)
	const linkArtist = await getArtist(input)

	// validate album (id or name)
	const linkAlbum = await getAlbum(input, track, linkArtist)

	// validate name
	const name = await getName(input, track, linkArtist)
	await checkNameConflict(input, track, name, linkArtist, linkAlbum)

	// validate mbid (re-check acoustid w/ new data to see if we can obtain a new mbid)
	const absolutePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, track.file.path)
	const metadata = await parseFile(absolutePath, { duration: true })
	const fingerprinted = await getFingerprinted(input, track, name, linkAlbum, linkArtist, metadata)

	const data: Prisma.TrackUpdateArgs["data"] = {}

	if (name) {
		data.name = name
		data.simplified = simplifiedName(name)
	}
	if (input.position !== undefined) {
		data.position = input.position
		data.metaPosition = input.position
	}
	if (fingerprinted?.id) {
		data.mbid = fingerprinted.id
	}
	if (input.coverId) {
		data.cover = { connect: { id: input.coverId } }
		data.coverLocked = true
	}

	if (fingerprinted) {
		// we need to first disconnect all genres, then connect the new ones
		data.genres = { set: [] }
	}

	if (linkArtist) {
		data.artist = { connect: { id: linkArtist.id } }
	} else if (input.artist?.name) {
		data.artist = {
			create: {
				name: input.artist.name,
				simplified: simplifiedName(input.artist.name),
				mbid: fingerprinted?.artists?.[0]?.id,
				genres: {
					connectOrCreate: cleanGenreList(
						fingerprinted?.artists?.[0]?.genres?.map(({ name }) => name) ?? []
					).map(({ name, simplified }) => ({
						where: { simplified },
						create: { name, simplified }
					}))
				}
			}
		}
	}

	if (linkAlbum) {
		data.album = { connect: { id: linkAlbum.id } }
	} else if (input.album?.name) {
		// album should only be created once we have an artist, to avoid duplicates
		data.album = { disconnect: true }
	}

	if (input.name || input.artist || input.album) {
		data.lastfmDate = null
		if (track.lastfm) data.lastfm = { delete: true }
		data.audiodbDate = null
		if (track.audiodb) data.audiodb = { delete: true }
		data.spotifyDate = null
		if (track.spotify) data.spotify = { delete: true }
	}

	const newTrack = await prisma.$transaction(async (tx) => {
		const newTrack = await tx.track.update({
			where: { id: input.id },
			data,
			select: {
				id: true,
				artist: { select: { id: true } },
				album: {
					select: {
						id: true,
						artistId: true,
					}
				},
			}
		})

		if (data.genres?.set) {
			await tx.track.update({
				where: { id: input.id },
				data: {
					genres: {
						connectOrCreate: cleanGenreList([
							...(metadata.common.genre ?? []),
							...(fingerprinted?.genres?.map(({ name }) => name) ?? []),
						]).map(({ name, simplified }) => ({
							where: { simplified },
							create: { name, simplified }
						}))
					}
				}
			})
		}

		if (data.album?.disconnect && input.album?.name) {
			const extraTrackData = await tx.track.update({
				where: { id: input.id },
				data: {
					album: {
						create: {
							name: input.album.name,
							simplified: simplifiedName(input.album.name),
							mbid: fingerprinted?.album?.id,
							tracksCount: fingerprinted?.of ?? metadata.common.track.of ?? undefined,
							artistId: newTrack.artist?.id,
							year: metadata.common.year,
							genres: {
								connectOrCreate: cleanGenreList(
									fingerprinted?.album?.genres?.map(({ name }) => name) ?? []
								).map(({ name, simplified }) => ({
									where: { simplified },
									create: { name, simplified }
								}))
							}
						}
					}
				},
				select: {
					album: {
						select: {
							id: true,
							artistId: true,
						}
					},
				}
			})
			newTrack.album = extraTrackData.album
		}

		if (track.userData && data.artist) {
			if (track.artist) {
				await tx.artist.update({
					where: { id: track.artist.id },
					data: {
						userData: {
							update: {
								favorite: { decrement: track.userData.favorite ? 1 : 0 },
								playcount: { decrement: track.userData.playcount },
							}
						}
					}
				})
			}
			if (newTrack.artist) {
				await tx.artist.update({
					where: { id: newTrack.artist.id },
					data: {
						userData: {
							upsert: {
								update: {
									favorite: { increment: track.userData.favorite ? 1 : 0 },
									playcount: { increment: track.userData.playcount },
								},
								create: {
									favorite: track.userData.favorite ? 1 : 0,
									playcount: track.userData.playcount,
								}
							}
						}
					}
				})
			}
		}

		if (track.userData && data.album) {
			if (track.album) {
				await tx.album.update({
					where: { id: track.album.id },
					data: {
						userData: {
							update: {
								favorite: { decrement: track.userData.favorite ? 1 : 0 },
								playcount: { decrement: track.userData.playcount },
							}
						}
					}
				})
			}
			if (newTrack.album) {
				await tx.album.update({
					where: { id: newTrack.album.id },
					data: {
						userData: {
							upsert: {
								update: {
									favorite: { increment: track.userData.favorite ? 1 : 0 },
									playcount: { increment: track.userData.playcount },
								},
								create: {
									favorite: track.userData.favorite ? 1 : 0,
									playcount: track.userData.playcount,
								}
							}
						}
					}
				})
			}
		}

		return newTrack
	})

	await computeTrackCover(track.id, { album: false, artist: false })
	if (input.album && track.album) {
		await computeAlbumCover(track.album.id, { tracks: false, artist: true })
	}
	if (input.artist && track.artist) {
		await computeArtistCover(track.artist.id, { album: false, tracks: false })
	}

	// ws invalidation of affected entities, new and old, and computed endpoints
	socketServer.emit("invalidate", { type: "track", id: track.id })
	if ((input.album || input.position) && track.album) socketServer.emit("invalidate", { type: "album", id: track.album.id })
	if (input.album && newTrack.album) {
		if (data.album?.disconnect) {
			socketServer.emit("add", { type: "album", id: newTrack.album.id })
			if (newTrack.album.artistId) socketServer.emit("invalidate", { type: "artist", id: newTrack.album.artistId })
		}
		else socketServer.emit("invalidate", { type: "album", id: newTrack.album.id })
	}
	if ((input.artist || input.album) && track.artist) socketServer.emit("invalidate", { type: "artist", id: track.artist.id })
	if (input.artist && newTrack.artist) {
		if (data.artist?.create) socketServer.emit("add", { type: "artist", id: newTrack.artist.id })
		else socketServer.emit("invalidate", { type: "artist", id: newTrack.artist.id })
	}
	if (track.userData && (input.artist || input.album)) socketServer.emit("metrics", { type: "likes" })
	if (track.userData && (input.artist || input.album)) socketServer.emit("metrics", { type: "listen-count" })


	fileWatcher.scheduleCleanup()
})

const validate = publicProcedure.input(trackInputSchema).mutation(async ({ input }) => {
	const track = await getTrack(input)

	// validate cover id
	await getCover(input, track)

	// validate artist (id or name)
	const linkArtist = await getArtist(input)

	// validate album (id or name)
	const linkAlbum = await getAlbum(input, track, linkArtist)

	// validate name
	const name = await getName(input, track, linkArtist)
	await checkNameConflict(input, track, name, linkArtist, linkAlbum)

	return true
})

const deleteTrack = protectedProcedure.input(z.object({
	id: z.string(),
})).mutation(async ({ input }) => {
	const track = await getTrack(input)
	const absolutePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, track.file.path)
	await unlink(absolutePath)
})

export const trackEditRouter = router({
	modify,
	validate,
	delete: deleteTrack,
})