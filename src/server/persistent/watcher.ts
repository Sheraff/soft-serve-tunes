import { FSWatcher, stat, watch, WatchEventType } from "node:fs"
import { join, sep } from "node:path"
import { env } from "../../env/server.mjs"
import { prisma } from "../db/client"
import createTrack from "../db/createTrack"
import listFilesFromDir from "../db/listFilesFromDir"

type MapValueType<A> = A extends Map<any, infer V> ? V : never;

class MyWatcher {
	static DELAY = 2_000

	watcher?: FSWatcher
	rootFolder: string
	watching: boolean = false

	constructor(rootFolder: string) {
		this.rootFolder = rootFolder
		this.onChange = this.onChange.bind(this)
		this.onError = this.onError.bind(this)
		this.onClose = this.onClose.bind(this)
		this.init(rootFolder)
	}

	init(rootFolder: string) {
		if (this.watching) {
			return
		}
		this.watcher = watch(rootFolder, { recursive: true, persistent: true })
		this.watcher.on('change', this.onChange)
		this.watcher.on('error', this.onError)
		this.watcher.once('close', this.onClose)
		this.watching = true
		console.log(`\x1b[32mready\x1b[0m - FSWatcher is watching ${rootFolder}`)
	}

	onClose() {
		this.watching = false
		this.watcher?.off('change', this.onChange)
		this.watcher?.off('error', this.onError)
		this.watcher?.close()
		this.init(this.rootFolder)
		console.log('\x1b[36minfo \x1b[0m - FSWatcher closed for some reason, restarting...')
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

	onChange(event: WatchEventType, filename: string) {
		const parts = filename.split(sep)
		if (parts.some((part) => part.startsWith('.'))) {
			return
		}
		if (event === 'rename') {
			const fullPath = asFullPath(filename)
			stat(fullPath, async (error, stats) => {
				if (error && error.code === 'ENOENT') {
					// technically, while this query is running, the entry could be modified by this.resolve, but it's unlikely
					const file = await prisma.file.findUnique({
						where: { path: fullPath },
						select: { ino: true },
					})
					if (!file) {
						const files = await prisma.file.findMany({
							where: { path: { startsWith: fullPath } },
							select: { ino: true, path: true },
						})
						if (files.length === 0) {
							console.log(`\x1b[31merror\x1b[0m - ${fullPath} removed, but not found in database`)
							return
						}
						for (const file of files) {
							const ino = String(file.ino)
							const entry = this.pending.get(ino)
							if (!entry) {
								this.pending.set(ino, {
									removed: asFullPath(file.path),
									timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
									ino,
								})
							} else {
								entry.removed = asFullPath(file.path)
							}
						}
						return
					}
					const ino = String(file.ino)
					const entry = this.pending.get(ino)
					if (!entry) {
						this.pending.set(ino, {
							removed: fullPath,
							timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
							ino,
						})
					} else {
						entry.removed = fullPath
					}
					return
				} else if (error) {
					console.error(error)
					return
				}
				if (stats.isDirectory()) {
					listFilesFromDir(filename).then((files) => {
						for (const file of files) {
							stat(file, (error, stats) => {
								if(error) {
									console.log(`\x1b[31merror\x1b[0m - ${file} could not be accessed for stats while adding ${fullPath}`)
									return
								}
								const ino = String(stats.ino)
								const entry = this.pending.get(ino)
								if (!entry) {
									this.pending.set(ino, {
										added: file,
										timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
										ino,
									})
								} else {
									entry.added = file
									this.enqueueResolve(ino)
								}
							})
						}
					})
					return
				}
				const ino = String(stats.ino)
				const entry = this.pending.get(ino)
				if (!entry) {
					this.pending.set(ino, {
						added: fullPath,
						timeout: setTimeout(() => this.enqueueResolve(ino), MyWatcher.DELAY),
						ino,
					})
				} else {
					entry.added = fullPath
					this.enqueueResolve(ino)
				}
			})
		} else if (event === 'change') {
			console.warn(`${filename} changed, but we don't know what to do with it`)
		} else {
			console.warn(`${filename} ${event} but we don't know what to do with it`)
		}
	}

	resolveQueue: MapValueType<typeof this.pending>[] = []
	async enqueueResolve(ino: string) {
		const entry = this.pending.get(ino)
		if (!entry) {
			console.log(`\x1b[31merror\x1b[0m - FSWatcher could not find ${ino} file in pending list`)
			return
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
	}

	async resolve(entry: MapValueType<typeof this.pending>) {
		const { removed, added, ino } = entry
		if (removed && added) {
			const dbIno = BigInt(ino)
			await prisma.file.update({
				where: { ino: dbIno },
				data: { path: added },
			})
			console.log(`\x1b[35mevent\x1b[0m - file move from ${removed}`)
			console.log(`\x1b[35mevent\x1b[0m - file move to ${added}`)
		} else if (removed) {
			const dbIno = BigInt(ino)
			const file = await prisma.file.delete({
				where: { ino: dbIno },
				select: { trackId: true, id: true },
			})
			if (file) {
				const track = await prisma.track.delete({
					where: { id: file.trackId },
					select: { name: true },
				})
				console.log(`\x1b[35mevent\x1b[0m - file removed from ${removed}, with associated track ${track.name}`)
			} else {
				console.log(`\x1b[31merror\x1b[0m - database File entry not found for ${removed} when trying to remove it`)
			}
		} else if (added) {
			await createTrack(added)
		} else {
			console.log(`\x1b[31merror\x1b[0m - FSWatcher could not resolve pending for ${ino} file`)
		}
	}
}

function asFullPath(path: string) {
	return join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, path)
}

declare global {
	var fileWatcher: MyWatcher | null;
}

export const fileWatcher = globalThis.fileWatcher
	|| new MyWatcher(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER)

if (env.NODE_ENV !== "production") {
	globalThis.fileWatcher = fileWatcher
}
