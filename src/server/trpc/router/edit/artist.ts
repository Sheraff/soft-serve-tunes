import { z } from "zod"
import { prisma } from "server/db/client"
import { router, protectedProcedure } from "server/trpc/trpc"
import { TRPCError } from "@trpc/server"
import { unlink } from "fs/promises"

const deleteArtist = protectedProcedure.input(z.object({
	id: z.string(),
})).mutation(async ({ input }) => {
	const artist = await prisma.artist.findUnique({
		where: { id: input.id },
		select: {
			id: true,
			albums: { select: { id: true, tracks: { select: { id: true } } } },
			tracks: { select: { id: true } },
		},
	})
	if (!artist) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Artist ${input.id} not found`,
		})
	}
	const tracks = new Set(artist.tracks.map((track) => track.id))
	artist.albums.forEach((album) => {
		album.tracks.forEach((track) => {
			tracks.add(track.id)
		})
	})
	for (const track of tracks) {
		const trackData = await prisma.track.findUnique({
			where: { id: track },
			select: { file: { select: { path: true } } },
		})
		if (!trackData?.file) continue
		await unlink(trackData.file.path)
	}
})

export const artistEditRouter = router({
	delete: deleteArtist,
})