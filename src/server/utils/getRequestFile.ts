import type { NextApiResponse } from "next"
import { stat } from "node:fs/promises"
import { join } from "node:path"


if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
	throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER

export default async function getRequestFile(file: string | string[] | undefined, res: NextApiResponse) {
	if (!file) {
		return res.status(400).json({error: "Missing file path"})
	}
	const particles = Array.isArray(file) ? file : [file]
	const path = join(rootFolder, ...particles)
	
	try {
		const stats = await stat(path)
		if (!stats.isFile()) {
			throw new Error("Not a file")
		}
		return {
			stats,
			path,
		}
	} catch (error) {
		return res.status(404).json({error: "File not found"})
	}
}