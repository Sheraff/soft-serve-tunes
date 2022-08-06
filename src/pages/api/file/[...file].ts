import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream } from "node:fs"
import getRequestFile from "../../../server/utils/getRequestFile"

export default async function file(req: NextApiRequest, res: NextApiResponse) {
  const {file} = req.query
  const data = await getRequestFile(file, res)
  if(!data)
    return
  const {stats, path} = data
  
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

