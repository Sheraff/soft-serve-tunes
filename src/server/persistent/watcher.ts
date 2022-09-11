import { stat, Stats } from "node:fs"
import { dirname, join, relative } from "node:path"
import { env } from "env/server.mjs"
import { prisma } from "server/db/client"
import createTrack from "server/db/createTrack"
import { socketServer } from "server/persistent/ws"
import chokidar from "chokidar"
import { unlink } from "node:fs/promises"
import log from "utils/logger"

type MapValueType<A> = A extends Map<string, infer V> ? V : never;

class MyWatcher {
	static DELAY = 2_100
	static CLEANUP_DELAY = 45_000

	watcher?: chokidar.FSWatcher
	rootFolder: string

	constructor(rootFolder: string) {
		this.rootFolder = rootFolder
		this.onAdd = this.onAdd.bind(this)
		this.onUnlink = this.onUnlink.bind(this)
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
		this.watcher.on('add', this.onAdd)
		this.watcher.on('unlink', this.onUnlink)
		this.watcher.on('error', this.onError)

		return new Promise((resolve) => {
			this.watcher?.once('ready', resolve)
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
		if(!stats) {
			stat(path, (error, stats) => {
				if(error) {
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
			this.enqueueResolve(ino)
			return
		}
		this.pending.set(ino, {
			added: path,
			timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
			ino,
		})
	}

	async onUnlink(path: string) {
		// technically, while this query is running, the entry could be modified by this.resolve, but it's unlikely
		const file = await prisma.file.findUnique({
			where: { path },
			select: { ino: true },
		})
		if (!file) {
			log("error", "error", "fswatcher", `${path} removed, but not found in database`)
			return
		}
		const ino = String(file.ino)
		const entry = this.pending.get(ino)
		if (entry) {
			entry.removed = path
			return
		}
		this.pending.set(ino, {
			removed: path,
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
				await this.resolve(nextItem)
				this.resolveQueue.shift()
			}
		}
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
			const dbIno = BigInt(ino)
			const file = await prisma.file.delete({
				where: { ino: dbIno },
				select: { trackId: true, id: true },
			})
			if (file?.trackId) {
				const track = await prisma.track.delete({
					where: { id: file.trackId },
					select: { name: true, id: true },
				})
				log("event", "event", "fswatcher", `file removed from ${removed}, with associated track ${track.name}`)
				socketServer.send('watcher:remove', { track })
			} else {
				log("error", "error", "fswatcher", `database File entry not found for ${removed} when trying to remove it`)
			}
		} else if (added) {
			await createTrack(added)
			socketServer.send('watcher:add')
		} else {
			log("error", "error", "fswatcher", `could not resolve pending for ${ino} file`)
		}
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
			},
		})
		await prisma.album.deleteMany({
			where: {
				id: {
					in: orphanedAlbums.map(album => album.id),
				},
			}
		})
		for (const album of orphanedAlbums) {
			log("event", "event", "fswatcher", `remove album ${album.name} because it wasn't linked to any tracks anymore`)
			socketServer.send('watcher:remove', { album })
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
		await prisma.artist.deleteMany({
			where: {
				id: {
					in: orphanedArtists.map(artist => artist.id),
				},
			}
		})
		for (const artist of orphanedArtists) {
			log("event", "event", "fswatcher", `remove artist ${artist.name} because it wasn't linked to any tracks or albums anymore`)
			socketServer.send('watcher:remove', { artist })
		}
		const orphanedGenres = await prisma.genre.findMany({
			where: {
				tracks: { none: {} },
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
			where: {
				id: {
					in: orphanedGenres.map(genre => genre.id),
				},
			}
		})
		for (const genre of orphanedGenres) {
			log("event", "event", "fswatcher", `remove genre ${genre.name} because it wasn't linked to any tracks or genre anymore`)
			socketServer.send('watcher:remove', { genre })
		}
		const orphanedImages = await prisma.image.findMany({
			where: {
				track: { none: {} },
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
				await unlink(join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, image.path))
				await prisma.image.delete({
					where: { id: image.id },
				})
				removeCount++
			} catch {
				failCount++
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

declare global {
	// eslint-disable-next-line no-var
	var fileWatcher: MyWatcher | null;
}

export const fileWatcher = globalThis.fileWatcher
	|| new MyWatcher(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER)

// if (env.NODE_ENV !== "production") {
	globalThis.fileWatcher = fileWatcher
// }
