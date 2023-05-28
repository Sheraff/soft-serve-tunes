import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { env } from "env/server.mjs"

export default async function listFilesFromDir(relativeDirPath = "", fileList: string[] = []): Promise<string[]> {
	const absoluteDirPath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, relativeDirPath)
	const dirEntries = await readdir(absoluteDirPath, { withFileTypes: true })
	for (const entry of dirEntries) {
		if (entry.name.startsWith(".")) {
			continue
		}
		if (entry.isDirectory()) {
			const path = join(relativeDirPath, entry.name)
			await listFilesFromDir(path, fileList)
		} else if (entry.isFile()) {
			const path = join(absoluteDirPath, entry.name)
			fileList.push(path)
		} else {
			const path = join(relativeDirPath, entry.name)
			console.warn(`Unknown file type: ${path}`)
		}
	}
	return fileList
}