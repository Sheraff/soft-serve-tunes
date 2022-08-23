import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream } from "node:fs"
import { prisma } from "server/db/client"
import log from "utils/logger"

export default async function file(req: NextApiRequest, res: NextApiResponse) {
  const {id} = req.query
  if (!id || Array.isArray(id)) {
    log("error", "400", `File request is missing an id`)
    return res.status(400).json({ error: "Missing id" })
  }

  const file = await prisma.file.findUnique({
    where: { trackId: id },
    select: { path: true, size: true, container: true },
  })
  if (!file) {
    log("error", "404", `File request could not match the id ${id}`)
    return res.status(404).json({ error: "File not found" })
  }
  
  const range = req.headers.range
  const partials = byteOffsetFromRangeString(range)
  const start = Number(partials[0])
  if (isNaN(start)) {
    log("error", "416", `File request for range is out of bounds (${file.path})`)
    return res.status(416).json({error: "Invalid range"})
  }
  const end = partials[1]
    ? Number(partials[1])
    : Math.min(file.size - 1, start + 512*1024 - 1)

  const content_type = `audio/${file.container}`
  const content_length = (end - start) + 1
  const content_range = `bytes ${start}-${end}/${file.size}`
  res.writeHead(206, {
    'Content-Type': content_type,
    'Content-Length': content_length,
    'Content-Range': content_range
  })

  if (range === undefined) {
    log("info", "206", `File request for range responded with available range (${file.path})`)
    return res.end()
  }

  log("info", "206", `File request for range is streaming (${file.path})`)
  const readStream = createReadStream(file.path, {start, end, highWaterMark: 512*1024})
  readStream.pipe(res)
}


function byteOffsetFromRangeString(range?: string) {
  if (range === undefined) {
    return [0]
  }
  return range.replace(/bytes=/, "").split("-");
}

