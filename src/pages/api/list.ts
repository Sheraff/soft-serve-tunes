// src/pages/api/examples.ts
import type { NextApiRequest, NextApiResponse } from "next"
import { FSWatcher, Stats, watch, WatchEventType } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, basename, extname } from "node:path"
import { IPicture, parseFile } from 'music-metadata'
import { prisma } from "../../server/db/client";
import { serialize } from "superjson"

if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
	throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER value in .env")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER


let initialized = false
let watcher: FSWatcher
export default async function listAllFiles(req: NextApiRequest, res: NextApiResponse) {
	if (!initialized) {
		console.log('------------ Initializing library ------------')
		await recursiveReaddirIntoDatabase()
		initialized = true
	}
	if (!watcher) {
		createWatcher()
	}
	const tracks = await prisma.track.findMany({
		orderBy: {
			name: "asc",
		},
		include: {
			artists: {
				select: {
					artist: {
						select: { name: true },
					},
				}
			}
		}
	})
	tracks.sort((a, b) => {
		const aArtist = a.artists?.[0]?.artist?.name
		const bArtist = b.artists?.[0]?.artist?.name
		if (aArtist !== bArtist) {
			if(!aArtist) return -1
			if(!bArtist) return 1
			return aArtist.localeCompare(bArtist)
		}
		return a.name.localeCompare(b.name)
	})
	res.json(serialize(tracks))
	res.end()
}

function createWatcher() {
	watcher = watch(rootFolder, { recursive: true, persistent: true })
	watcher.on('change', libraryUpdater)
	watcher.on('error', console.error)
	watcher.on('close', createWatcher)
}

async function libraryUpdater(event: WatchEventType, filename: string) {
	console.log(`${event}: ${filename}`)
	if (basename(filename).startsWith('.')) {
		return
	}
	if (event === 'rename') {
		// try {
		// 	const stats = await stat(join(rootFolder, filename))
		// 	persistedLibrary.set(filename, stats)
		// } catch ({code}) {
		// 	if (code === 'ENOENT') {
		// 		prisma.
		// 		persistedLibrary.delete(filename)
		// 	}
		// }
		console.warn(`${filename} moved, but DB wasn't updated`)
	} else if (event === 'change') {
		console.warn(`${filename} changed, but we don't know what to do with it`)
	}
}

// async function recursiveReaddir(dirPath: string = '', files: Library = new Map()): Promise<Library> {
// 	const dir = join(rootFolder, dirPath)
// 	const dirFiles = await readdir(dir)
// 	for (const file of dirFiles) {
// 		if (file.startsWith('.')) {
// 			continue
// 		}
// 		const relativePath = join(dirPath, file)
// 		const filePath = join(rootFolder, relativePath)
// 		const stats = await stat(filePath)
// 		if (stats.isDirectory()) {
// 			await recursiveReaddir(relativePath, files)
// 		} else if (stats.isFile()) {
// 			files.set(relativePath, stats)
// 		} else {
// 			console.warn(`Unknown file type: ${relativePath}`)
// 		}
// 	}
// 	return files
// }

async function recursiveReaddirIntoDatabase(dirPath: string = '') {
	const dir = join(rootFolder, dirPath)
	const dirFiles = await readdir(dir)
	for (const file of dirFiles) {
	// return Promise.allSettled(dirFiles.map(async (file) => {
		if (file.startsWith('.')) {
			// return
			continue
		}
		const relativePath = join(dirPath, file)
		const filePath = join(rootFolder, relativePath)
		const stats = await stat(filePath)
		if (stats.isDirectory()) {
			await recursiveReaddirIntoDatabase(relativePath)
		} else if (stats.isFile()) {
			await createTrack(filePath, stats)
		} else {
			console.warn(`Unknown file type: ${relativePath}`)
		}
	// }))
	}
}

async function createTrack(path: string, stats: Stats) {
	console.log(`Creating track for ${path}`)
	const metadata = await parseFile(path)
	
	const uselessNameRegex = /^[0-9\s]*(track|piste)[0-9\s]*$/i
	const name = metadata.common.title && !uselessNameRegex.test(metadata.common.title)
		? metadata.common.title
		: basename(path, extname(path))

	try {
		const artistStrings = new Set<string>()
		if (metadata.common.artist) {
			artistStrings.add(metadata.common.artist)
		}
		if (metadata.common.artists) {
			metadata.common.artists.forEach(artist => artistStrings.add(artist))
		}
		const artists = await Promise.all(Array.from(artistStrings).map(async (artist) => {
			const existing = await prisma.artist.findUnique({
				where: { name: artist },
				select: { id: true },
			})
			if (existing) {
				return existing.id
			}
			const created = await prisma.artist.create({
				data: { name: artist },
			})
			return created.id
		}))
		await prisma.file.create({
			data: {
				path: path,
				size: stats.size,
				ino: stats.ino,
				duration: metadata.format.duration ?? 0,
				updatedAt: new Date(stats.mtimeMs),
				createdAt: new Date(stats.ctimeMs),
				birthTime: new Date(stats.birthtime),
				// trackId: track.id,
				track: {
					create: {
						name,
						// artists,
						// albums,
						popularity: 0,
						year: metadata.common.year,
						// genres,
						// pictureId: cover,
						picture: metadata.common.picture?.[0]?.data
							? {
								connectOrCreate: {
									where: {
										data: metadata.common.picture[0].data,
									},
									create: {
										data: metadata.common.picture[0].data,
										mime: metadata.common.picture[0].format
									}
								}
							}
							: undefined,
						artists: {
							create: artists.map(artist => ({
								artistId: artist,
							})),
						}
					}
				},
			},
		})
		console.log(`Added ${path}`)
		console.log(`should have created artist ${metadata.common.artist} / ${metadata.common.artists}`)
		console.log(`should have created album ${metadata.common.album}`)
		console.log(`should have created genre ${metadata.common.genre}`)
	} catch (e) {
		console.error(e)
	}
}

async function getOrCreateCover(picture: IPicture | undefined) {
	if(!picture) {
		return
	}
	const existing = await prisma.cover.findUnique({
		where: { data: picture.data },
		select: { id: true },
	})
	if(existing) {
		return existing.id
	}
	const created = await prisma.cover.create({
		data: { data: picture.data },
	})
	return created.id
}