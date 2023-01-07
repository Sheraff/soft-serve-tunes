import { router, protectedProcedure, publicProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { prisma } from "server/db/client"
import { TRPCError } from "@trpc/server"
import { simplifiedName } from "utils/sanitizeString"
import { lastFm } from "server/persistent/lastfm"
import { acoustId } from "server/persistent/acoustId"
import { type IAudioMetadata } from "music-metadata"
import similarStrings from "utils/similarStrings"

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

function getTrack(input: Input) {
	return prisma.track.findUnique({
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
}

type Track = Omit<Exclude<Awaited<ReturnType<typeof getTrack>>, null>, 'file'> & {
	file: Exclude<Exclude<Awaited<ReturnType<typeof getTrack>>, null>['file'], null>
}

function validateTrack(input: Input, track: Awaited<ReturnType<typeof getTrack>>): track is Track {
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
	return true
}

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
	name: string | undefined,
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

const modify = protectedProcedure.input(trackInputSchema).mutation(async ({ input, ctx }) => {
	const track = await getTrack(input)

	// validate track id
	if (!validateTrack(input, track)) return

	// validate cover id
	await getCover(input, track)

	// validate artist (id or name)
	const linkArtist = await getArtist(input)

	// validate album (id or name)
	const linkAlbum = await getAlbum(input, track, linkArtist)

	// validate name
	const name = await getName(input, track, linkArtist)
	await checkNameConflict(input, track, name, linkArtist, linkAlbum)

	// validate position ?

	// validate mbid (re-check acoustid w/ new data to see if we can obtain a new mbid)
	const mbid = await (async () => {
		// if none of [name, artist, album] has changed, keep the same mbid
		// how to measure "has changed"?
		if (false) {
			return undefined
		}
		const metadata = {
			format: {
				duration: track.file.duration,
			} as IAudioMetadata["format"],
			common: {
				title: name || track.name,
				album: linkAlbum?.name || input.album?.name || track.album?.name,
				artist: linkArtist?.name || input.artist?.name || track.artist?.name,
			} as IAudioMetadata["common"],
		}
		const fingerprinted = await acoustId.identify(track.file.path, metadata)
		if (!fingerprinted || !fingerprinted.title) return null
		const sameName = similarStrings(fingerprinted.title, name || track.name)
		if (!sameName) return null
		if (track.artist?.name) {
			if (!fingerprinted.artists?.[0]?.name) return null
			const sameArtist = similarStrings(fingerprinted.artists?.[0]?.name, track.artist.name)
			if (!sameArtist) return null
		}
		const albumName = linkAlbum?.name || input.album?.name || track.album?.name
		if (albumName) {
			if (!fingerprinted.album?.title) return null
			const sameAlbum = similarStrings(fingerprinted.album.title, albumName)
			if (!sameAlbum) return null
		}
		return fingerprinted.id
	})()

	console.log({
		name,
		linkArtist,
		linkAlbum,
		mbid,
		cover: input.coverId,
	})

	// update entities
	// if relevant, remove mbid (and replace w/ acoustid revalidated mbid if possible)
	// if name changed, update "simplified" too
	// update user data (likes counter and listen counter for album & artist, disconnected and newly connected)
	// revalidate covers (if coverId changed, or if linked album / linked artist changed) (we should add a "static cover" column on UserData to avoid auto-selecting covers when the user has manually selected one)
	// disconnect lastfm, audiodb, spotify, etc. if [what condition?]
	// db cleanup (like after watcher deletion)
	// remove "last checked" dates for lastfm, audiodb, spotify, etc. and trigger recheck
	// ws invalidation of affected entities (potentially: track, album, artist, by-trait, playlist, searchable)
})

const validate = publicProcedure.input(trackInputSchema).mutation(async ({ input }) => {
	const track = await getTrack(input)

	// validate track id
	if (!validateTrack(input, track)) return

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