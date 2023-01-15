import { z } from "zod"
import { prisma } from "server/db/client"
import { router, protectedProcedure } from "server/trpc/trpc"
import { TRPCError } from "@trpc/server"
import { fileWatcher } from "server/persistent/watcher"
import { socketServer } from "utils/typedWs/server"

const deleteGenre = protectedProcedure.input(z.object({
	id: z.string(),
})).mutation(async ({ input }) => {
	const genre = await prisma.genre.findUnique({
		where: { id: input.id },
		select: { id: true },
	})
	if (!genre) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Genre ${input.id} not found`,
		})
	}
	await prisma.genre.update({
		where: { id: input.id },
		data: {
			tracks: {set: []},
			albums: {set: []},
			artists: {set: []},
			spotifyArtists: {set: []},
			audiodbTracks: {set: []},
			// not updating subgenre and supgenres because we might still need this genre to be a link in the graph
			// (plus, future entities might use this genre and it's good to have kept graph connections)
		},
	})
	fileWatcher.scheduleCleanup()
	socketServer.emit("remove", {type: "genre", id: input.id})
})

export const genreEditRouter = router({
	delete: deleteGenre,
})