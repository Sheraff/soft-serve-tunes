import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { env } from "env/server.mjs"

export default async function listFilesFromDir(dirPath = "", fileList: string[] = []): Promise<string[]> {
	const dir = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, dirPath)
	const dirFiles = await readdir(dir)
	for (const file of dirFiles) {
	  if (file.startsWith(".")) {
		continue
	  }
	  const relativePath = join(dirPath, file)
	  const filePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, relativePath)
	  const stats = await stat(filePath)
	  if (stats.isDirectory()) {
		await listFilesFromDir(relativePath, fileList)
	  } else if (stats.isFile()) {
		fileList.push(filePath)
	  } else {
		console.warn(`Unknown file type: ${relativePath}`)
	  }
	}
	return fileList
  }