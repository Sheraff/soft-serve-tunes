import { stat, Stats } from "node:fs"
import { dirname, join, relative } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import createTrack from "server/db/createTrack"
import chokidar from "chokidar"
import { unlink } from "node:fs/promises"
import log from "utils/logger"
import retryable from "utils/retryable"
import { socketServer } from "utils/typedWs/server"

type MapValueType<A> = A extends Map<string, infer V> ? V : never;

class MyWatcher {
	static DELAY = 3_100
	static CLEANUP_DELAY = 45_000

	watcher?: chokidar.FSWatcher
	rootFolder: string

	constructor(rootFolder: string) {
		this.rootFolder = rootFolder
		this.onAdd = this.onAdd.bind(this)
		this.onUnlink = this.onUnlink.bind(this)
		this.onUnlinkMany = this.onUnlinkMany.bind(this)
		this.scheduleUnlinkFile = this.scheduleUnlinkFile.bind(this)
		this.scheduleCleanup = this.scheduleCleanup.bind(this)
		this.removeFileFromDb = this.removeFileFromDb.bind(this)
		this.removeTrackFromDb = this.removeTrackFromDb.bind(this)
		this.onError = this.onError.bind(this)
		this.init()
	}

	async init() {
		if (this.watcher) {
			log("info", "wait", "fswatcher", "restarting...")
			await this.watcher.close()
		} else {
			log("info", "wait", "fswatcher", "initializing...")
		}

		this.watcher = chokidar.watch(this.rootFolder, {
			ignored: /(^|[\/\\])\../, // ignore dot files
			persistent: true,
			atomic: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: MyWatcher.DELAY - 100,
			},
		})
		this.watcher.on("add", this.onAdd)
		this.watcher.on("unlink", this.onUnlink)
		this.watcher.on("unlinkDir", this.onUnlinkMany)
		this.watcher.on("error", this.onError)

		return new Promise((resolve) => {
			this.watcher?.once("ready", resolve)
			log("ready", "ready", "fswatcher", `watching ${this.rootFolder}`)
		})
	}

	onError(error: Error) {
		log("error", "error", "fswatcher", error.name)
		console.log(error)
	}

	pending: Map<string, {
		removed?: string,
		added?: string,
		timeout: NodeJS.Timeout,
		ino: string,
	}> = new Map()

	async onAdd(path: string, stats?: Stats) {
		if (!stats) {
			stat(path, (error, stats) => {
				if (error) {
					log("error", "error", "fswatcher", `could not access file for stats as it was being added ${path}`)
					return
				}
				this.onAdd(path, stats)
			})
			return
		}
		const ino = String(stats.ino)
		const entry = this.pending.get(ino)
		if (entry) {
			entry.added = path
			return
		}
		this.pending.set(ino, {
			added: path,
			timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
			ino,
		})
	}

	async onUnlinkMany(partial: string) {
		const files = await prisma.file.findMany({
			where: { path: { startsWith: partial } },
			select: { ino: true, path: true },
		})
		if (!files.length) {
			log("error", "error", "fswatcher", `Directory "${partial}" removed, but no file found in database`)
			return
		}
		files.forEach((file) => this.scheduleUnlinkFile(file))
	}

	async onUnlink(path: string) {
		// technically, while this query is running, the entry could be modified by this.resolve, but it's unlikely
		const file = await prisma.file.findUnique({
			where: { path },
			select: { ino: true, path: true },
		})
		if (!file) {
			log("error", "error", "fswatcher", `File "${path}" removed, but not found in database`)
			return
		}
		this.scheduleUnlinkFile(file)
	}

	scheduleUnlinkFile(file: {ino: bigint, path: string}) {
		const ino = String(file.ino)
		const entry = this.pending.get(ino)
		if (entry) {
			entry.removed = file.path
			return
		}
		this.pending.set(ino, {
			removed: file.path,
			timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
			ino,
		})
	}

	resolveQueue: MapValueType<typeof this.pending>[] = []
	cleanupTimeoutId: NodeJS.Timeout | null = null
	async enqueueResolve(ino: string) {
		const entry = this.pending.get(ino)
		if (!entry) {
			log("error", "error", "fswatcher", `could not find ${ino} file in pending list`)
			return
		}
		if (this.cleanupTimeoutId) {
			clearTimeout(this.cleanupTimeoutId)
		}
		clearTimeout(entry.timeout)
		this.pending.delete(ino)
		this.resolveQueue.push(entry)
		if (this.resolveQueue.length === 1) {
			let nextItem
			while (nextItem = this.resolveQueue[0]) {
				try {
					await this.resolve(nextItem)
				} catch (e) {
					// catching because failing to add/remove a file shouldn't fail the entire queue
					console.error(e)
				}
				this.resolveQueue.shift()
			}
		}
		this.scheduleCleanup()
	}

	scheduleCleanup() {
		if (this.cleanupTimeoutId) {
			clearTimeout(this.cleanupTimeoutId)
		}
		this.cleanupTimeoutId = setTimeout(() => this.cleanup(), MyWatcher.CLEANUP_DELAY)
	}

	async resolve(entry: MapValueType<typeof this.pending>) {
		const { removed, added, ino } = entry
		if (removed && added) {
			const dbIno = BigInt(ino)
			await prisma.file.update({
				where: { ino: dbIno },
				data: { path: added },
			})
			log("event", "event", "fswatcher", `file move ${added} (from ${dirname(relative(dirname(added), removed))})`)
		} else if (removed) {
			await this.removeFileFromDb(removed)
		} else if (added) {
			log("event", "event", "fswatcher", `file sent to createTrack ${added}`)
			await createTrack(added)
		} else {
			log("error", "error", "fswatcher", `could not resolve pending for ${ino} file`)
		}
	}

	async removeFileFromDb(path: string) {
		const file = await retryable(() => prisma.file.delete({
			where: { path },
			select: { trackId: true, id: true },
		}))
		if (file?.trackId) {
			const deletedTrack = await this.removeTrackFromDb(file.trackId)
			if (deletedTrack) {
				log("event", "event", "fswatcher", `file removed from ${path}, with associated track ${deletedTrack.name}`)
			} else {
				log("error", "error", "fswatcher", `file removed from ${path}, but associated track missing id#${file.trackId}`)
			}
		} else {
			log("error", "error", "fswatcher", `database File entry not found for ${path} when trying to remove it`)
		}
	}

	async removeTrackFromDb(id: string) {
		const track = await prisma.track.findUnique({
			where: { id },
			select: {
				name: true,
				id: true,
				albumId: true,
				artistId: true,
				userData: {
					select: {
						playcount: true,
						favorite: true,
					}
				},
				playlistEntries: {
					select: {
						id: true,
						playlistId: true,
						index: true,
					}
				}
			}
		})
		if (!track) {
			return track
		}
		await prisma.$transaction([
			...(track.userData && track.albumId ? [
				prisma.album.update({
					where: {id: track.albumId},
					data: {userData: {update: {
						playcount: {decrement: track.userData.playcount},
						...(track.userData.favorite ? {favorite: {decrement: 1}} : {}),
					}}}
				})
			] : []),
			...(track.userData && track.artistId ? [
				prisma.artist.update({
					where: {id: track.artistId},
					data: {userData: {update: {
						playcount: {decrement: track.userData.playcount},
						...(track.userData.favorite ? {favorite: {decrement: 1}} : {}),
					}}}
				})
			] : []),
			...(track.playlistEntries.length ? [
				prisma.playlistEntry.deleteMany({
					where: { id: {in: track.playlistEntries.map(({id}) => id)} },
				}),
				...track.playlistEntries.map((entry) => (
					prisma.playlistEntry.updateMany({
						where: {
							playlistId: entry.playlistId,
							index: {gte: entry.index}
						},
						data: {index: {decrement: 1}}
					})
				)),
				prisma.playlist.deleteMany({
					where: {tracks: {none: {}}}
				}),
			] : []),
			prisma.track.delete({
				where: { id },
			})
		])
		socketServer.emit("remove", { type: "track", id: track.id })
		return track
	}

	async cleanup() {
		this.cleanupTimeoutId = null
		const orphanedAlbums = await prisma.album.findMany({
			where: {
				tracks: { none: {} },
			},
			select: {
				id: true,
				name: true,
				artistId: true,
			},
		})
		const orphanedAlbumsIds = orphanedAlbums.map(album => album.id)
		await prisma.album.deleteMany({
			where: { id: {in: orphanedAlbumsIds} }
		})
		for (const album of orphanedAlbums) {
			log("event", "event", "fswatcher", `remove album ${album.name} because it wasn't linked to any tracks anymore`)
			socketServer.emit("remove", { type: "album", id: album.id })
			if (album.artistId) {
				socketServer.emit("invalidate", { type: "artist", id: album.artistId })
			}
		}
		const orphanedArtists = await prisma.artist.findMany({
			where: {
				tracks: { none: {} },
				albums: { none: {} },
				feats: { none: {} },
			},
			select: {
				id: true,
				name: true,
			},
		})
		const orphanedArtistsIds = orphanedArtists.map(artist => artist.id)
		await prisma.artist.deleteMany({
			where: { id: {in: orphanedArtistsIds} }
		})
		for (const artist of orphanedArtists) {
			log("event", "event", "fswatcher", `remove artist ${artist.name} because it wasn't linked to any tracks or albums anymore`)
			socketServer.emit("remove", { type: "artist", id: artist.id })
		}
		const orphanedGenres = await prisma.genre.findMany({
			where: {
				tracks: { none: {} },
				artists: { none: {} },
				albums: { none: {} },
				subgenres: { none: {} },
				supgenres: { none: {} },
				spotifyArtists: { none: {} },
				audiodbTracks: { none: {} },
			},
			select: {
				id: true,
				name: true,
			}
		})
		await prisma.genre.deleteMany({
			where: {id: {in: orphanedGenres.map(genre => genre.id)}}
		})
		for (const genre of orphanedGenres) {
			log("event", "event", "fswatcher", `remove genre ${genre.name} because it wasn't linked to any tracks or genre anymore`)
			socketServer.emit("remove", { type: "genre", id: genre.id })
		}

		const orphanedPlaylists = await prisma.playlist.findMany({
			where: {tracks: {none: {}}},
			select: {id: true, name: true},
		})
		await prisma.playlist.deleteMany({
			where: {id: {in: orphanedPlaylists.map(playlist => playlist.id)}}
		})
		for (const playlist of orphanedPlaylists) {
			log("event", "event", "fswatcher", `remove playlist ${playlist.name} because it wasn't linked to any tracks anymore`)
			socketServer.emit("remove", { type: "playlist", id: playlist.id })
		}

		const orphanedImages = await prisma.image.findMany({
			where: {
				track: { none: {} },
				trackCover: { none: {} },
				artistCover: { none: {} },
				albumCover: { none: {} },
				lastfmAlbum: { none: {} },
				lastfmArtist: { none: {} },
				audiodbTrack: { none: {} },
				audiodbArtistThumb: { none: {} },
				audiodbArtistLogo: { none: {} },
				audiodbArtistCutout: { none: {} },
				audiodbArtistClearart: { none: {} },
				audiodbArtistWideThumb: { none: {} },
				audiodbArtistBanner: { none: {} },
				audiodbAlbumThumb: { none: {} },
				audiodbAlbumThumbHq: { none: {} },
				audiodbAlbumCdArt: { none: {} },
				spotifyArtist: { none: {} },
				spotifyAlbum: { none: {} },
			},
			select: {
				path: true,
				id: true,
			}
		})
		let removeCount = 0
		let failCount = 0
		for (const image of orphanedImages) {
			try {
				try {
					await unlink(join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, image.path))
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
						throw e
					}
				}
				await prisma.image.delete({
					where: { id: image.id },
				})
				removeCount++
			} catch (e) {
				failCount++
				console.error(new Error(`error while removing image ${image.path}`, {cause: e}))
			}
		}
		if (removeCount > 0) {
			log("event", "event", "fswatcher", `removed ${removeCount} images that weren't linked to anything anymore`)
		}
		if (failCount > 0) {
			log("error", "error", "fswatcher", `failed to remove ${failCount} images that aren't linked to anything anymore`)
		}
	}
}

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const fileWatcher = (globalThis.fileWatcher || new MyWatcher(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER)) as InstanceType<typeof MyWatcher>
// @ts-expect-error -- see above
globalThis.fileWatcher = fileWatcher
