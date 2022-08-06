// src/pages/api/examples.ts
import type { NextApiRequest, NextApiResponse } from "next"
import { FSWatcher, Stats, watch, WatchEventType } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"

type Library = Map<string, Stats>

if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
	throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER


let persistedLibrary: Library
let watcher: FSWatcher
export default async function listAllFiles(req: NextApiRequest, res: NextApiResponse) {
	if (!persistedLibrary) {
		persistedLibrary = await recursiveReaddir()
	}
	if (!watcher) {
		createWatcher()
	}
	const stringifyable = Object.fromEntries(persistedLibrary.entries())
	res.json(stringifyable)
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
		try {
			const stats = await stat(join(rootFolder, filename))
			persistedLibrary.set(filename, stats)
		} catch ({code}) {
			if (code === 'ENOENT' && persistedLibrary.has(filename)) {
				persistedLibrary.delete(filename)
			}
		}
	} else if (event === 'change') {
		console.warn(`${filename} changed, but we don't know what to do with it`)
	}
}

async function recursiveReaddir(dirPath: string = '', files: Library = new Map()): Promise<Library> {
	const dir = join(rootFolder, dirPath)
	const dirFiles = await readdir(dir)
	for (const file of dirFiles) {
		if (file.startsWith('.')) {
			continue
		}
		const relativePath = join(dirPath, file)
		const filePath = join(rootFolder, relativePath)
		const stats = await stat(filePath)
		if (stats.isDirectory()) {
			await recursiveReaddir(relativePath, files)
		} else if (stats.isFile()) {
			files.set(relativePath, stats)
		} else {
			console.warn(`Unknown file type: ${relativePath}`)
		}
	}
	return files
}
