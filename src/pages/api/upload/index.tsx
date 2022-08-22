import { IAudioMetadata, parseFile } from "music-metadata"
import type { NextApiRequest, NextApiResponse } from "next"
import formidable, { Fields, Files } from "formidable"
import { mkdir, rename, stat, unlink } from "fs/promises"
import { basename, dirname, extname, join, sep } from "path"
import sanitize from "sanitize-filename"
import { env } from "env/server.mjs"
import { fileWatcher } from "server/persistent/watcher"
import { spotify } from "server/persistent/spotify"
import sanitizeString from "utils/sanitizeString"
import pathToSearch from "utils/pathToSearch"
import { socketServer } from "server/persistent/ws"
import log from "utils/logger"

export default async function upload(req: NextApiRequest, res: NextApiResponse) {
	const form = new formidable.IncomingForm({
		multiples: true,
	})
	const [fields, files] = await new Promise<[Fields, Files] | []>((resolve) => {
		form.parse(req, async function (err, fields, files) {
			if (err) {
				resolve([])
			} else {
				resolve([fields, files])
			}
		})
	})
	if (!files || !fields) {
		res.status(400).end()
		return
	}
	const uploads = Array.isArray(files['file[]']) ? files['file[]'] : [files['file[]']]
	const names = Array.isArray(fields['name']) ? fields['name'] : [fields['name']]
	const indexes = (Array.isArray(fields['index']) ? fields['index'] : [fields['index']]).map(Number)
	const of = (Array.isArray(fields['of']) ? fields['of'] : [fields['of']]).map(Number)
	const wakeUpSignal = Array.isArray(fields['wakeup']) ? fields['wakeup'][0] : fields['wakeup']
	socketServer.send('upload:progress', getProgress(0, indexes, of))

	// make sure watcher is awake
	if (wakeUpSignal) {
		await fileWatcher.init()
	}

	for (let i = 0; i < uploads.length; i++) {
		socketServer.send('upload:progress', getProgress(i, indexes, of))
		const upload = uploads[i]
		const name = names[i]
		if (!upload || !name) {
			continue
		}
		log("event", "event", "fswatcher", `uploading "${name}"`)
		let metadata: IAudioMetadata
		try {
			metadata = await parseFile(upload.filepath)
			if (!metadata)
				throw ""
		} catch {
			log("error", "error", "fswatcher", `upload failed to parse metadata out of "${name}"`)
			continue
		}
		if (!metadata.common.title || !metadata.common.artist || !metadata.common.album) {
			const search = sanitizeString(metadata.common.title || pathToSearch(name))
			log("info", "wait", "spotify", `upload paused for metadata from ${search}`)
			const response = await spotify.fetch(`search?type=track&q=${search}`)
			if ('tracks' in response) {
				const bestEffort = response.tracks.items[0]
				if (bestEffort) {
					metadata.common.title ||= bestEffort.name
					metadata.common.album ||= bestEffort.album.name
					if (bestEffort.artists[0]?.name) {
						metadata.common.artist ||= bestEffort.artists[0].name
					}
					metadata.common.track.no ||= bestEffort.track_number
				}
			}
		}
		const metaDirname = await directoryFromMetadata(metadata)
		const filename = getFileName(metadata, name)
		if (metaDirname) {
			const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, metaDirname, filename)
			const success = await moveTempFile(upload.filepath, proposed)
			if (success) {
				continue
			}
		}
		const originalDirname = await directoryFromOriginal(name)
		if (originalDirname && originalDirname !== sep) {
			const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, originalDirname, filename)
			const success = await moveTempFile(upload.filepath, proposed)
			if (success) {
				continue
			}
		}
		const randomDirname = await directoryFromRandom()
		const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, randomDirname, filename)
		const success = await moveTempFile(upload.filepath, proposed)
		if (!success) {
			log("error", "error", "fswatcher", `failed to upload "${name}"`)
			unlink(upload.filepath)
		}
	}
	if (indexes.at(-1) === of.at(-1)) {
		socketServer.send('upload:progress', 1)
	}
	return res.status(201).end()
}

export const config = {
	api: {
		bodyParser: false
	}
}

async function moveTempFile(origin: string, destination: string) {
	try {
		await stat(destination)
		log("warn", "retry", "fswatcher", `${destination} already exists`)
		return false
	} catch {}
	await mkdir(dirname(destination), {recursive: true})
	await rename(origin, destination)
	log("ready", "201", "fswatcher", `upoaded to ${destination}`)
	return true
}

function directoryFromMetadata(metadata: IAudioMetadata) {
	const { artist, album } = metadata.common
	if (artist && album) {
		const proposed = join(sanitize(artist), sanitize(album))
		return proposed
	}
}

function directoryFromOriginal(original: string) {
	return dirname(original)
}

function directoryFromRandom() {
	const stablePrefix = Number([...Math.round(Date.now() / 10_000).toString()].reverse().join('')).toString(36)
	const variableSuffix = Math.round(Math.random() * 36_000_000).toString(36)
	const string = `${stablePrefix}${variableSuffix}` as (string & {0: string, 1: string, 2: string})
	return join('__soft-served', string[0], string[1], string[2], string)
}

function getFileName(metadata: IAudioMetadata, original: string) {
	const { title, track: {no} } = metadata.common
	if (title && typeof no === 'number') {
		const sanitizedTitle = sanitize(title)
		const numberString = String(no).padStart(2, '0')
		return `${numberString} ${sanitizedTitle}.${dumbExtensionGuessing(metadata, original)}`
	}
	if (title) {
		const sanitizedTitle = sanitize(title)
		return `${sanitizedTitle}.${dumbExtensionGuessing(metadata, original)}`
	}
	return basename(original)
}

function dumbExtensionGuessing(metadata: IAudioMetadata, original: string) {
	const { codec, container } = metadata.format
	switch (true) {
		case codec?.includes('MPEG-4'):
			return 'mp4'
		case codec?.includes('MPEG'):
			return 'mp3'
		case codec?.includes('AAC'):
		case codec?.includes('ALAC'):
		case container?.includes('matroska'):
			return 'm4a'
		case container?.includes('WAVE') && codec?.includes('PCM'):
			return 'wav'
	}
	return extname(original)
}

function getProgress(i: number, indexes: number[], of: number[]) {
	const start = indexes[i] ?? 0
	const total = of[i] || 1
	return start / total
}