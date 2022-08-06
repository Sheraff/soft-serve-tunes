// src/pages/api/examples.ts
import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { join } from "node:path"

if (!process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER) {
  throw new Error("Missing NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER")
}
const rootFolder = process.env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER

export default async function file(req: NextApiRequest, res: NextApiResponse) {
  const {file} = req.query
  if (!file) {
    return res.status(400).json({error: "Missing file path"})
  }
  const particles = Array.isArray(file) ? file : [file]
  const path = join(rootFolder, ...particles)

  let stats
  try {
    stats = await stat(path)
  } catch (error) {
    return res.status(404).json({error: "File not found"})
  }
  console.table(stats)
  
  const range = req.headers.range
  const partials = byteOffsetFromRangeString(range)
  const start = Number(partials[0])
  if (isNaN(start)) {
    return res.status(416).json({error: "Invalid range"})
  }
  const end = partials[1]
    ? Number(partials[1])
    : Math.min(stats.size - 1, start + 256*1024 - 1)

  const content_length = (end - start) + 1
  const content_range = `bytes ${start}-${end}/${stats.size}`;
  res.writeHead(206, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': content_length,
    'Content-Range': content_range
  })

  console.log({file, content_range})

  if (range === undefined) {
    return res.end()
  }

  const readStream = createReadStream(path, {start, end, highWaterMark: 256*1024})
  readStream.pipe(res)
}


function byteOffsetFromRangeString(range?: string) {
  if (range === undefined) {
    return [0]
  }
  return range.replace(/bytes=/, "").split("-");
}

