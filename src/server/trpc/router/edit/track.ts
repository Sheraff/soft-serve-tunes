import { router, protectedProcedure, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { type Prisma } from "@prisma/client"
import { prisma } from "server/db/client"
import { TRPCError } from "@trpc/server"
import { cleanGenreList, simplifiedName } from "utils/sanitizeString"
import { lastFm } from "server/persistent/lastfm"
import { acoustId } from "server/persistent/acoustId"
import { type IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"
import { socketServer } from "utils/typedWs/server"
import { fileWatcher } from "server/persistent/watcher"

	/*
	 * should we do the same checks we do for `createTrack`?
	 * - correct names w/ lastfm
	 * - prevent useless names
	 * - match on acoustid (if name changes, maybe another suggestion might be selected)
	 */


// maybe create a GET endpoint that does all of those checks and just returns whether it would be valid or not

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

async function getTrack(input: Input) {
	const track = await prisma.track.findUnique({
		where: { id: input.id },
		select: {
			id: true,
			name: true,
			coverId: true,
			position: true,
			mbid: true,
			album: {select: {
				id: true,
				name: true,
			}},
			artist: {select: {
				id: true,
				name: true,
			}},
			file: {select: {
				path: true,
				duration: true,
			}},
			userData: {select: {
				playcount: true,
				favorite: true,
			}},
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
	return track as Omit<typeof track, 'file'> & {
		file: Exclude<typeof track['file'], null>
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
	if (!input.artist?.id && !input.artist?.name) return
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
	const artist = await prisma.artist.findFirst({
		where: {
			simplified: simplifiedName(input.artist.name),
		},
		select: { id: true, name: true },
	})
	return artist ?? undefined
}

async function getAlbum(input: Input, track: Track, artist: Awaited<ReturnType<typeof getArtist>>) {
	if (!input.album?.id && !input.album?.name) return
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
	const album = await prisma.album.findFirst({
		where: {
			simplified: simplifiedName(input.album.name),
			artistId: artist?.id ?? track.artist?.id,
		},
		select: { id: true, name: true },
	})
	return album ?? undefined
}

async function getName(input: Input, track: Track, artist: Awaited<ReturnType<typeof getArtist>>) {
	if (!input.name) return
	const artistName = artist?.name ?? input.artist?.name ?? track.artist?.name
	if (artistName) {
		const correctedName = await lastFm.correctTrack(artistName, input.name)
		return correctedName
	}
	return input.name
}

async function checkNameConflict(
	input: Input,
	track: Track,
	name: Awaited<ReturnType<typeof getName>>,
	artist: Awaited<ReturnType<typeof getArtist>>,
	album: Awaited<ReturnType<typeof getAlbum>>,
) {
	if (name) {
		const other = await prisma.track.count({
			where: {
				simplified: simplifiedName(name),
				id: { not: input.id },
				artistId: artist?.id ?? (input.artist ? undefined : track.artist?.id),
				albumId: album?.id ?? (input.album ? undefined : track.album?.id),
			},
		})
		if (other > 0) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Track "${input.name}" already exists for artist "${artist?.name ?? input.artist?.name ?? track.artist?.name}" and album "${album?.name ?? input.album?.name ?? track.album?.name}"`,
			})
		}
	}
}

async function getFingerprinted(
	input: Input,
	track: Track,
	name: Awaited<ReturnType<typeof getName>>,
	album: Awaited<ReturnType<typeof getAlbum>>,
	artist: Awaited<ReturnType<typeof getArtist>>
) {
	// if none of [name, artist, album] has changed, keep the same mbid
	if (!input.name && !input.artist && !input.album) {
		return undefined
	}
	const metadata = {
		format: {
			duration: track.file.duration,
		} as IAudioMetadata["format"],
		common: {
			title: name || track.name,
			album: album?.name || input.album?.name || track.album?.name,
			artist: artist?.name || input.artist?.name || track.artist?.name,
		} as IAudioMetadata["common"],
	}

	const fingerprinted = await acoustId.identify(track.file.path, metadata)
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
	const fingerprinted = await getFingerprinted(input, track, name, linkAlbum, linkArtist)

	const data: Prisma.TrackUpdateArgs['data'] = {}

	if (name) {
		data.name = name
		data.simplified = simplifiedName(name)
	}
	if (input.position !== undefined) {
		data.position = input.position
	}
	if (fingerprinted?.id) {
		data.mbid = fingerprinted.id
	}
	if (input.coverId) {
		data.cover = { connect: { id: input.coverId } }
		data.coverLocked = true
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
						fingerprinted?.artists?.[0]?.genres?.map(({name}) => name) ?? []
					).map(({name, simplified}) => ({
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
		data.album = {
			create: {
				name: input.album.name,
				simplified: simplifiedName(input.album.name),
				mbid: fingerprinted?.album?.id,
				tracksCount: fingerprinted?.of,
				// artistId
				// genres: fingerprinted.album.genres
			}
		}
	}

	if (name || input.artist || input.album) {
		data.lastfmDate = null
		data.lastfm = {delete: true}
		data.audiodbDate = null
		data.audiodb = {delete: true}
		data.spotifyDate = null
		data.spotify = {delete: true}
	}

	const newTrack = await prisma.track.update({
		where: { id: input.id },
		data,
		select: {
			id: true,
			artist: {select: {id: true}},
			album: {select: {id: true}},
		}
	})

	if (track.userData && data.artist) {
		if (track.artist) {
			await prisma.artist.update({
				where: { id: track.artist.id },
				data: { userData: { update: {
					favorite: { decrement: track.userData.favorite ? 1 : 0 },
					playcount: { decrement: track.userData.playcount },
				} } }
			})
		}
		if (newTrack.artist) {
			await prisma.artist.update({
				where: { id: newTrack.artist.id },
				data: { userData: { update: {
					favorite: { increment: track.userData.favorite ? 1 : 0 },
					playcount: { increment: track.userData.playcount },
				} } }
			})
		}
	}

	if (track.userData && data.album) {
		if (track.album) {
			await prisma.album.update({
				where: { id: track.album.id },
				data: { userData: { update: {
					favorite: { decrement: track.userData.favorite ? 1 : 0 },
					playcount: { decrement: track.userData.playcount },
				} } }
			})
		}
		if (newTrack.album) {
			await prisma.album.update({
				where: { id: newTrack.album.id },
				data: { userData: { update: {
					favorite: { increment: track.userData.favorite ? 1 : 0 },
					playcount: { increment: track.userData.playcount },
				} } }
			})
		}
	}

	await computeTrackCover(track.id, {album: true, artist: true})
	if (input.album && track.album) {
		await computeAlbumCover(track.album.id, {tracks: false, artist: true})
	}
	if (input.artist && track.artist) {
		await computeArtistCover(track.artist.id, {album: false, tracks: false})
	}

	// ws invalidation of affected entities, new and old, and computed endpoints (potentially: track, album, artist, by-trait, playlist, searchable)
	// socketServer.emit("add", {type: "track", id: track.id})
	// if (track.artistId) socketServer.emit("add", {type: "artist", id: track.artistId})
	// const albumId = track.albumId ?? linkedAlbum?.albumId
	// if (albumId) socketServer.emit("add", {type: "album", id: albumId})

	fileWatcher.scheduleCleanup()

	console.log({
		name,
		linkArtist,
		linkAlbum,
		fingerprinted,
		cover: input.coverId,
	})

	// +update entities
	// +if relevant, remove mbid (and replace w/ acoustid revalidated mbid if possible)
	// +if name changed, update "simplified" too
	// +update user data (likes counter and listen counter for album & artist, disconnected and newly connected)
	// +revalidate covers (if coverId changed, or if linked album / linked artist changed) (we should add a "static cover" column on UserData to avoid auto-selecting covers when the user has manually selected one)
	// +disconnect lastfm, audiodb, spotify, etc. if [what condition?]
	// +db cleanup (like after watcher deletion)
	// +remove "last checked" dates for lastfm, audiodb, spotify, etc. and trigger recheck
	// ws invalidation of affected entities (potentially: track, album, artist, by-trait, playlist, searchable)
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

export const trackEditRouter = router({
	modify,
	validate,
})