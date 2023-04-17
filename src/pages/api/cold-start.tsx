import { NextApiRequest, NextApiResponse } from "next"
import { prisma } from "server/db/client"
import { fileWatcher } from "server/persistent/watcher"
import createTrack from "server/db/createTrack"
import listFilesFromDir from "server/db/listFilesFromDir"
import log from "utils/logger"
import { socketServer } from "utils/typedWs/server"
import { stat, unlink } from "fs/promises"
import { removeImageEntry } from "pages/api/cover/[...parts]"
import { join, relative } from "path"
import { env } from "env/server.mjs"

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const loadingStatus = (globalThis.loadingStatus || {
	populated: false,
	promise: null,
}) as {
	populated: boolean
	promise: Promise<null | void> | null
}
// @ts-expect-error -- see above
globalThis.loadingStatus = loadingStatus

function act () {
	if (loadingStatus.promise) {
		return
	}
	let total = 0
	let done = 0
	const interval = setInterval(() => {
		const progress = total
			? done / total
			: 0
		socketServer.emit("loading", progress)
	}, 500)
	loadingStatus.promise = Promise.all([
		listFilesFromDir(),
		listFilesFromDir(".meta")
	])
		.then(async ([trackFiles, imageFiles]) => {
			total = trackFiles.length + imageFiles.length
			for (const file of trackFiles) {
				await createTrack(file)
				done++
			}
			for (const file of imageFiles) {
				let img: { id: string } | null = null
				const path = relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, file)
				try {
					const match = path.match(/\/([a-z0-9]*)_[0-9]{1,4}x[0-9]{1,4}\./)
					if (!match) {
						img = await prisma.image.findUnique({
							where: { path },
							select: { id: true }
						})
						if (!img) throw new Error("unused")
					} else {
						const id = match[1]
						img = await prisma.image.findUnique({
							where: { id },
							select: { id: true }
						})
						if (!img) throw new Error("derived image without parent")
					}
					const stats = await stat(file)
					if (stats.size === 0) throw new Error("empty file")
				} catch (e) {
					if (img) {
						await removeImageEntry(img.id)
					} else {
						await unlink(file)
						log("event", "event", "fswatcher", `removed image ${file} because it was empty or unused`)
					}
				}
				done++
			}
			return [new Set(trackFiles), new Set(imageFiles)] as const
		})
		.then(async ([trackPaths, imagePaths]) => {
			try {
				// remove tracks without files
				const orphanTracks = await prisma.track.findMany({
					where: { file: { is: null } },
					select: { id: true, name: true }
				})
				for (const track of orphanTracks) {
					const deletedTrack = await fileWatcher.removeTrackFromDb(track.id)
					if (deletedTrack) {
						log("event", "event", "fswatcher", `track ${track.name} removed because no associated file was found`)
					} else {
						log("error", "error", "fswatcher", `couldn't delete a file that was just obtained through a prisma query... id#${track.id}`)
					}
				}

				let removed = false
				// since we already listed all files in the library (`listFilesFromDir`),
				// we can use that to remove files from the db that are no longer in the library
				tracks: {
					const chunkSize = 300
					let cursor = 0
					let dbFiles
					do {
						dbFiles = await prisma.file.findMany({
							take: chunkSize,
							skip: cursor,
							select: { path: true },
						})
						cursor += chunkSize
						for (const dbFile of dbFiles) {
							if (!trackPaths.has(dbFile.path)) {
								removed = true
								await fileWatcher.removeFileFromDb(dbFile.path)
							}
						}
					} while (dbFiles.length === chunkSize)
				}
				imgs: {
					const chunkSize = 300
					let cursor = 0
					let dbImages
					do {
						dbImages = await prisma.image.findMany({
							take: chunkSize,
							skip: cursor,
							select: { path: true, id: true },
						})
						cursor += chunkSize
						for (const dbImage of dbImages) {
							if (!imagePaths.has(join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, dbImage.path))) {
								removed = true
								await removeImageEntry(dbImage.id)
							}
						}
					} while (dbImages.length === chunkSize)
				}

				// remove old acoustidStorage lookups
				await prisma.acoustidStorage.deleteMany({
					where: {
						updatedAt: {
							lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // older than a week
						}
					}
				})

				if (removed || orphanTracks.length) {
					fileWatcher.scheduleCleanup()
				}
			} catch (e) {
				// catching error because lack of cleanup shouldn't prevent app from starting up
				console.error(new Error("error depopulating database", { cause: e }))
			}
		})
		.then(() => {
			loadingStatus.populated = true
			socketServer.onConnection("loading", 1)
		})
		.finally(() => {
			socketServer.emit("loading", 1)
			clearInterval(interval)
			loadingStatus.promise = null
			log("ready", "ready", "fswatcher", "All files in the music directory have an entry in the database, all database entries without a file are removed")
		})
}

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
	if (loadingStatus.populated) {
		return res.status(204).end()
	}
	act()
	return res.status(202).end()
}
