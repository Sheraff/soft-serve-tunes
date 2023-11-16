import { router, publicProcedure, protectedProcedure } from "server/trpc/trpc"
import { z } from "zod"
import { lastFm } from "server/persistent/lastfm"
import { spotify } from "server/persistent/spotify"
import { audioDb } from "server/persistent/audiodb"
import log from "utils/logger"
import retryable from "utils/retryable"
import { socketServer } from "utils/typedWs/server"
import { TRPCError } from "@trpc/server"
import { getTrackMiniature } from "server/trpc/router/track/trackMiniatureQuery"
import { getTrackSearchable } from "server/trpc/router/track/trackSearchableQuery"
import { getTracksByMultiTraits } from "server/trpc/router/track/trackByMultiTraits"

export const zTrackTraits = z.enum([
	"danceability",
	"energy",
	"speechiness",
	"acousticness",
	"instrumentalness",
	"liveness",
	"valence",
])

const searchable = publicProcedure.query(getTrackSearchable)

const miniature = publicProcedure.input(z.object({
	id: z.string(),
})).query(async ({ input }) => {
	const [track] = await getTrackMiniature(input.id)
	if (!track) {
		throw new TRPCError({ code: "NOT_FOUND", message: `track.miniature looked for unknown track by id ${input.id}` })
	}

	lastFm.findTrack(input.id)
	spotify.findTrack(input.id)
	audioDb.fetchTrack(input.id)

	return track
})

const playcount = protectedProcedure.input(z.object({
	id: z.string(),
})).mutation(async ({ input, ctx }) => {
	const now = new Date().toISOString()
	const track = await retryable(() => ctx.prisma.track.findUnique({
		where: { id: input.id },
		select: { albumId: true, artistId: true, name: true },
	}))
	if (!track) {
		throw new TRPCError({ code: "NOT_FOUND", message: `could not find track ${input.id} for playcount increase` })
	}

	await ctx.prisma.$transaction([
		ctx.prisma.track.update({
			where: { id: input.id },
			data: {
				userData: {
					upsert: {
						update: { playcount: { increment: 1 }, lastListen: now },
						create: { playcount: 1, lastListen: now }
					}
				}
			}
		}),
		...(track.albumId ? [
			ctx.prisma.album.update({
				where: { id: track.albumId },
				data: {
					userData: {
						upsert: {
							update: { playcount: { increment: 1 }, lastListen: now },
							create: { playcount: 1, lastListen: now }
						}
					}
				}
			})
		] : []),
		...(track.artistId ? [
			ctx.prisma.artist.update({
				where: { id: track.artistId },
				data: {
					userData: {
						upsert: {
							update: { playcount: { increment: 1 }, lastListen: now },
							create: { playcount: 1, lastListen: now }
						}
					}
				}
			})
		] : []),
	])

	log("info", "200", "trpc", `playcount +1 track "${track.name}"`)
	socketServer.emit("invalidate", { type: "track", id: input.id })
	if (track.albumId)
		socketServer.emit("invalidate", { type: "album", id: track.albumId })
	if (track.artistId)
		socketServer.emit("invalidate", { type: "artist", id: track.artistId })
	if (track.albumId || track.artistId)
		socketServer.emit("metrics", { type: "listen-count" })
})

const like = protectedProcedure.input(z.object({
	id: z.string(),
	toggle: z.boolean(),
})).mutation(async ({ input, ctx }) => {
	const track = await retryable(() => ctx.prisma.track.findUnique({
		where: { id: input.id },
		select: { albumId: true, artistId: true, name: true },
	}))

	const kind = input.toggle ? "increment" : "decrement"
	const init = input.toggle ? 1 : 0

	if (!track) {
		throw new TRPCError({ code: "NOT_FOUND", message: `could not find track ${input.id} for like ${kind}` })
	}

	const { albumId, artistId } = track
	await ctx.prisma.$transaction([
		ctx.prisma.track.update({
			where: { id: input.id },
			data: {
				userData: {
					upsert: {
						update: { favorite: input.toggle },
						create: { favorite: input.toggle }
					}
				}
			}
		}),
		...(albumId ? [
			ctx.prisma.album.update({
				where: { id: albumId },
				data: {
					userData: {
						upsert: {
							update: { favorite: { [kind]: 1 } },
							create: { favorite: init }
						}
					}
				}
			})
		] : []),
		...(artistId ? [
			ctx.prisma.artist.update({
				where: { id: artistId },
				data: {
					userData: {
						upsert: {
							update: { favorite: { [kind]: 1 } },
							create: { favorite: init }
						}
					}
				}
			})
		] : []),
	])

	log("info", "200", "trpc", `like ${input.toggle} track "${track.name}"`)
	socketServer.emit("invalidate", { type: "track", id: input.id })
	if (albumId)
		socketServer.emit("invalidate", { type: "album", id: albumId })
	if (artistId)
		socketServer.emit("invalidate", { type: "artist", id: artistId })
	socketServer.emit("metrics", { type: "likes" })

	return track
})

export async function getSpotifyTracksByMultiTraitsWithTarget(
	traits: {
		trait: z.infer<typeof zTrackTraits>,
		value: number | string
	}[],
	count: number,
	excludeIds: string[] = [],
) {
	const traitsMap = Object.fromEntries(traits.map((t) => [t.trait, Number(t.value)])) as Record<z.infer<typeof zTrackTraits>, number | undefined>
	const excludeSet = excludeIds.length === 0 ? ["not-an-id"] : excludeIds
	return getTracksByMultiTraits(traitsMap, count, excludeSet)
}

const byMultiTraits = protectedProcedure.input(z.object({
	traits: z.array(z.object({
		trait: zTrackTraits,
		value: z.string(),
	})),
})).query(async ({ input }) => {
	return getSpotifyTracksByMultiTraitsWithTarget(input.traits, 6)
})

export const trackRouter = router({
	searchable,
	miniature,
	playcount,
	like,
	byMultiTraits,
})
