import { IAudioMetadata, parseFile } from "music-metadata"
import type { NextApiRequest, NextApiResponse } from "next"
import formidable, { Fields, Files } from "formidable"
import { mkdir, rename, unlink } from "fs/promises"
import { basename, dirname, extname, join, sep } from "path"
import sanitize from "sanitize-filename"
import { env } from "../../../env/server.mjs"
import { fileWatcher } from "../../../server/persistent/watcher"

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

	// make sure watcher is awake
	await fileWatcher.init()

	for (let i = 0; i < uploads.length; i++) {
		const upload = uploads[i]
		const name = names[i]
		if (!upload || !name) {
			continue
		}
		console.log(`\x1b[35mevent\x1b[0m - uploading ${name}`)
		const metadata = await parseFile(upload.filepath)
		const metaDirname = await directoryFromMetadata(metadata)
		const filename = getFileName(metadata, name)
		if (metaDirname) {
			const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, metaDirname, filename)
			try {
				await mkdir(dirname(proposed), {recursive: true})
				await rename(upload.filepath, proposed)
				continue
			} catch {}
		}
		const originalDirname = await directoryFromOriginal(name)
		if (originalDirname && originalDirname !== sep) {
			const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, originalDirname, filename)
			try {
				await mkdir(dirname(proposed), {recursive: true})
				await rename(upload.filepath, proposed)
				continue
			} catch {}
		}
		const randomDirname = await directoryFromRandom()
		const proposed = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, randomDirname, filename)
		try {
			await mkdir(dirname(proposed), {recursive: true})
			await rename(upload.filepath, proposed)
		} catch {
			console.log(`\x1b[31merror\x1b[0m - failed to upload ${name}`)
			unlink(upload.filepath)
		}
	}

	return res.status(201).end()
}

export const config = {
	api: {
		bodyParser: false
	}
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
	const timestamp = Date.now()
	const random = Math.round(Math.random() * 1_000)
	const string = Number(`${timestamp}${random}`).toString(36) as (string & {0: string, 1: string, 2: string})
	return join(string[0], string[1], string[2], string)
}

function getFileName(metadata: IAudioMetadata, original: string) {
	const { title, track: {no} } = metadata.common
	if (title && typeof no === 'number') {
		const numberString = String(no).padStart(2, '0')
		return `${numberString} ${title}.${dumbExtensionGuessing(metadata, original)}`
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