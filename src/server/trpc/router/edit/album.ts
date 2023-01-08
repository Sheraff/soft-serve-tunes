import { z } from "zod"
import { type Prisma } from "@prisma/client"
import { prisma } from "server/db/client"
import { router, protectedProcedure, publicProcedure } from "server/trpc/trpc"
import { TRPCError } from "@trpc/server"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"
import { socketServer } from "utils/typedWs/server"
import { fileWatcher } from "server/persistent/watcher"
import { simplifiedName } from "utils/sanitizeString"
import { unlink } from "fs/promises"

const albumInputSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	coverId: z.string().optional(),
	artist: z.object({
		id: z.string().optional(),
		name: z.string(),
	}).optional(),
})

type Input = z.infer<typeof albumInputSchema>

async function getAlbum(input: {id: string}) {
	const album = await prisma.album.findUnique({
		where: { id: input.id },
		select: {
			id: true,
			coverId: true,
			artist: { select: { id: true, name: true } },
			tracks: { select: { id: true } },
			spotify: { select: { id: true } },
			lastfm: { select: { id: true } },
			audiodb: { select: { entityId: true } },
		}
	})
	if (!album) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Album ${input.id} not found`,
		})
	}
	return album
}

type Album = Awaited<ReturnType<typeof getAlbum>>

async function getCover(input: Input, album: Album) {
	if (input.coverId && album.coverId !== input.coverId) {
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
	if (!artist) throw new TRPCError({
		code: "NOT_FOUND",
		message: `Cannot create artist "${input.artist.name}" from album`,
	})
	return artist
}

async function getName(input: Input) {
	if (!input.name) return
	return input.name
}

async function checkNameConflict(
	input: Input,
	album: Album,
	name: Awaited<ReturnType<typeof getName>>,
	artist: Awaited<ReturnType<typeof getArtist>>,
) {
	if (name) {
		const other = await prisma.album.count({
			where: {
				simplified: simplifiedName(name),
				id: { not: input.id },
				artistId: artist?.id ?? (input.artist ? undefined : album.artist?.id),
			},
		})
		if (other > 0) {
			throw new TRPCError({
				code: "CONFLICT",
				message: `Album "${input.name}" already exists for artist "${artist?.name ?? input.artist?.name ?? album.artist?.name}"`,
			})
		}
	}
}

const modify = protectedProcedure.input(albumInputSchema).mutation(async ({ input, ctx }) => {
	const album = await getAlbum(input)

	// validate cover id
	await getCover(input, album)

	// validate artist (id or name)
	const linkArtist = await getArtist(input)
	
	// validate name
	const name = await getName(input)
	await checkNameConflict(input, album, name, linkArtist)

	const data: Prisma.AlbumUpdateArgs['data'] = {}

	if (name) {
		data.name = name
		data.simplified = simplifiedName(name)
	}
	if (input.coverId) {
		data.cover = { connect: { id: input.coverId } }
		data.coverLocked = true
	}
	if (input.name || input.artist) {
		data.lastfmDate = null
		if (album.lastfm) data.lastfm = {delete: true}
		data.audiodbDate = null
		if (album.audiodb) data.audiodb = {delete: true}
		data.spotifyDate = null
		if (album.spotify) data.spotify = {delete: true}
	}

	if (linkArtist) {
		data.artist = { connect: { id: linkArtist.id } }
	}

	const newAlbum = await prisma.$transaction(async (tx) => {
		const newAlbum = await tx.album.update({
			where: { id: input.id },
			data,
			select: {
				id: true,
				artist: { select: { id: true, name: true } },
			}
		})
		if (input.name || input.artist) {
			const tracks = await tx.track.findMany({
				where: { albumId: input.id },
				select: {
					id: true,
					audiodb: { select: { entityId: true } },
					lastfm: { select: { id: true } },
					spotify: { select: { id: true } },
				}
			})
			for (const track of tracks) {
				await tx.track.update({
					where: { id: track.id },
					data: {
						audiodbDate: null,
						lastfmDate: null,
						spotifyDate: null,
						audiodb: track.audiodb ? {delete: true} : undefined,
						lastfm: track.lastfm ? {delete: true} : undefined,
						spotify: track.spotify ? {delete: true} : undefined,
					}
				})
			}
		}
		return newAlbum
	})

	await computeAlbumCover(album.id, {tracks: false, artist: false})
	for (const track of album.tracks) {
		await computeTrackCover(track.id, {album: false, artist: true})
	}
	if (album.artist) {
		await computeArtistCover(album.artist.id, {album: false, tracks: false})
	}

	socketServer.emit("invalidate", {type: "album", id: album.id})
	if (input.artist && album.artist) {
		socketServer.emit("invalidate", {type: "artist", id: album.artist.id})
	}
	if (input.artist && newAlbum.artist) {
		socketServer.emit("invalidate", {type: "artist", id: newAlbum.artist.id})
	}

	fileWatcher.scheduleCleanup()
})

const validate = publicProcedure.input(albumInputSchema).mutation(async ({ input, ctx }) => {
	const album = await getAlbum(input)

	// validate cover id
	await getCover(input, album)

	// validate artist (id or name)
	const linkArtist = await getArtist(input)
	
	// validate name
	const name = await getName(input)
	await checkNameConflict(input, album, name, linkArtist)

	return true
})

const deleteAlbum = protectedProcedure.input(z.object({
	id: z.string(),
})).mutation(async ({ input }) => {
	const album = await getAlbum(input)
	for (const track of album.tracks) {
		const trackData = await prisma.track.findUnique({
			where: { id: track.id },
			select: { file: { select: { path: true } } },
		})
		if (!trackData?.file) continue
		await unlink(trackData.file.path)
	}
})

export const albumEditRouter = router({
	modify,
	validate,
	delete: deleteAlbum,
})