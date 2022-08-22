import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream } from "node:fs"
import { prisma } from "server/db/client"

export default async function file(req: NextApiRequest, res: NextApiResponse) {
  const {id} = req.query
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Missing id" })
  }

  const file = await prisma.file.findUnique({
    where: { trackId: id },
    select: { path: true, size: true, container: true },
  })
  if (!file) {
    return res.status(404).json({ error: "File not found" })
  }
  
  const range = req.headers.range
  const partials = byteOffsetFromRangeString(range)
  const start = Number(partials[0])
  if (isNaN(start)) {
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
    return res.end()
  }

  const readStream = createReadStream(file.path, {start, end, highWaterMark: 512*1024})
  readStream.pipe(res)
}


function byteOffsetFromRangeString(range?: string) {
  if (range === undefined) {
    return [0]
  }
  return range.replace(/bytes=/, "").split("-");
}

