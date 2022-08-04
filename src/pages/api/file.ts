// src/pages/api/examples.ts
import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream, statSync } from "node:fs"

const examples = async (req: NextApiRequest, res: NextApiResponse) => {
  const file = `${process.cwd()}/public/library/Bligg - Mit Paukä _ Trompetä.mp3`
  const stats = statSync(file)
  const range = req.headers.range

  console.log('range', range)

  if (range === undefined) {
    res.writeHead(206, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stats.size,
    })
    const readStream = createReadStream(file)
    readStream.pipe(res)
    return
  }

  const partials = range.replace(/bytes=/, "").split("-")
  const start = Number(partials[0])
  if (isNaN(start)) {
    return res.status(500)
  }
  const end = partials[1]
    ? Number(partials[1])
    : Math.min(stats.size - 1, start + 16*1024 - 1)

  const content_length = (end - start) + 1
  res.writeHead(206, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': content_length,
    'Content-Range': "bytes " + start + "-" + end + "/" + stats.size
  })

  const readStream = createReadStream(file, {start, end, highWaterMark: 16*1024})
  readStream.pipe(res)
};

export default examples;
