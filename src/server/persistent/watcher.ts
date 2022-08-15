import { stat, Stats } from "node:fs"
import { dirname, join, relative } from "node:path"
import { env } from "../../env/server.mjs"
import { prisma } from "../db/client"
import createTrack from "../db/createTrack"
import { socketServer } from "./ws"
import chokidar from "chokidar"
import { unlink } from "node:fs/promises"

type MapValueType<A> = A extends Map<any, infer V> ? V : never;

class MyWatcher {
	static DELAY = 2_100
	static CLEANUP_DELAY = 1_000

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
			console.log(`\x1b[36mwait \x1b[0m - restarting FSWatcher...`)
			await this.watcher.close()
		} else {
			console.log(`\x1b[36mwait \x1b[0m - initializing FSWatcher...`)
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
			console.log(`\x1b[32mready\x1b[0m - FSWatcher is watching ${this.rootFolder}`)
		})
	}

	onError(error: Error) {
		console.log(`\x1b[31merror\x1b[0m - FSWatcher: ${error.name}`, error)
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
					console.log(`\x1b[31merror\x1b[0m - could not access file for stats as it was being added ${path}`)
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
			console.log(`\x1b[31merror\x1b[0m - ${path} removed, but not found in database`)
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
			console.log(`\x1b[31merror\x1b[0m - FSWatcher could not find ${ino} file in pending list`)
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
			console.log(`\x1b[35mevent\x1b[0m - file move ${added} (from ${dirname(relative(dirname(added), removed))})`)
		} else if (removed) {
			const dbIno = BigInt(ino)
			const file = await prisma.file.delete({
				where: { ino: dbIno },
				select: { trackId: true, id: true },
			})
			if (file) {
				const track = await prisma.track.delete({
					where: { id: file.trackId },
					select: { name: true, id: true },
				})
				console.log(`\x1b[35mevent\x1b[0m - file removed from ${removed}, with associated track ${track.name}`)
				socketServer.send('watcher:remove', { track })
			} else {
				console.log(`\x1b[31merror\x1b[0m - database File entry not found for ${removed} when trying to remove it`)
			}
		} else if (added) {
			await createTrack(added)
			socketServer.send('watcher:add')
		} else {
			console.log(`\x1b[31merror\x1b[0m - FSWatcher could not resolve pending for ${ino} file`)
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
			console.log(`\x1b[35mevent\x1b[0m - remove album ${album.name} because it wasn't linked to any tracks anymore`)
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
			console.log(`\x1b[35mevent\x1b[0m - remove artist ${artist.name} because it wasn't linked to any tracks or albums anymore`)
			socketServer.send('watcher:remove', { artist })
		}
		const orphanedGenres = await prisma.genre.findMany({
			where: {
				tracks: { none: {} },
				subgenres: { none: {} },
				supgenres: { none: {} },
				spotifyArtists: { none: {} },
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
			console.log(`\x1b[35mevent\x1b[0m - remove genre ${genre.name} because it wasn't linked to any tracks or genre anymore`)
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
			console.log(`\x1b[35mevent\x1b[0m - removed ${removeCount} images that weren't linked to anything anymore`)
		}
		if (failCount > 0) {
			console.log(`\x1b[31merror\x1b[0m - failed to remove ${failCount} images that aren't linked to anything anymore`)
		}
	}
}

declare global {
	// eslint-disable-next-line no-var
	var fileWatcher: MyWatcher | null;
}

export const fileWatcher = globalThis.fileWatcher
	|| new MyWatcher(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER)

if (env.NODE_ENV !== "production") {
	globalThis.fileWatcher = fileWatcher
}
