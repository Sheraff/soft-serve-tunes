import { NextApiRequest, NextApiResponse } from "next"
import { prisma } from "server/db/client"
import { fileWatcher } from "server/persistent/watcher"
import createTrack from "server/db/createTrack"
import listFilesFromDir from "server/db/listFilesFromDir"
import log from "utils/logger"
import { socketServer } from "utils/typedWs/server"

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

function act() {
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
	loadingStatus.promise = listFilesFromDir()
		.then(async (list) => {
			total = list.length
			for (const file of list) {
				await createTrack(file)
				done++
			}
			return new Set(list)
		})
		.then(async (list) => {
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

				// remove database records of files that have no filesystem file
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
						if (!list.has(dbFile.path)) {
							await fileWatcher.removeFileFromDb(dbFile.path)
						}
					}
				} while (dbFiles.length === chunkSize)

				if (dbFiles.length || orphanTracks.length) {
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

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
	if (loadingStatus.populated) {
		return res.status(200).json({ done: true })
	}
	act()
	return res.status(200).json({ done: false })
}