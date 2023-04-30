import type { NextApiRequest, NextApiResponse } from "next"
import { getServerAuthSession } from "server/common/get-server-auth-session"
import { createReadStream } from "node:fs"
import { prisma } from "server/db/client"
import log from "utils/logger"
import { readFile } from "node:fs/promises"
import { env } from "env/server.mjs"
import { relative } from "node:path"
import { getLocalNetworkAuth } from "server/common/local-auth"

export default async function file (req: NextApiRequest, res: NextApiResponse) {
  const isLocal = getLocalNetworkAuth(req)
  if (!isLocal && !(await getServerAuthSession({ req, res }))) {
    return res.status(401).json({ error: "authentication required" })
  }
  res.setHeader("Access-Control-Allow-Origin", "*")

  const { id } = req.query
  if (!id || Array.isArray(id)) {
    log("error", "400", "File request is missing an id")
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
  // allow 200 response if no `range: byte=0-` is specified
  if (range === undefined) {
    const buffer = await readFile(file.path)
    res.writeHead(200, {
      "Content-Type": `audio/${file.container}`,
      "Content-Length": file.size,
      "Cache-Control": "public, max-age=31536000",
    })
    res.write(buffer)
    log("info", "200", `File request was sent in full (${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, file.path)})`)
    return res.end()
  }
  const partials = byteOffsetFromRangeString(range)
  const start = Number(partials[0])
  if (isNaN(start)) {
    log("error", "416", `File request for range is out of bounds (${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, file.path)})`)
    return res.status(416).json({ error: "Invalid range" })
  }
  const end = partials[1]
    ? Number(partials[1])
    : Math.min(file.size - 1, start + 512 * 1024 - 1)

  const content_type = `audio/${file.container}`
  const content_length = (end - start) + 1
  const content_range = `bytes ${start}-${end}/${file.size}`
  res.writeHead(206, {
    "Content-Type": content_type,
    "Content-Length": content_length,
    "Content-Range": content_range,
    "Cache-Control": "public, max-age=31536000",
  })

  if (range === undefined) {
    log("info", "206", `File request for range responded with available range (${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, file.path)})`)
    return res.end()
  }

  log("info", "206", `File request for range is streaming (${relative(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, file.path)})`)
  const readStream = createReadStream(file.path, { start, end, highWaterMark: 512 * 1024 })
  readStream.pipe(res)
}


function byteOffsetFromRangeString (range?: string) {
  if (range === undefined) {
    return [0]
  }
  return range.replace(/bytes=/, "").split("-")
}

export const config = {
  api: {
    responseLimit: false,
  },
}
