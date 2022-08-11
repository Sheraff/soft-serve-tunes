import type { NextApiRequest, NextApiResponse } from "next"
import { createReadStream } from "node:fs"
import { join } from "node:path"
import { env } from "../../../env/server.mjs"
import { prisma } from "../../../server/db/client"

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
  const {id} = req.query
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Missing id" })
  }
  const cover = await prisma.image.findUnique({
    where: { id },
    select: { path: true, mimetype: true },
  })
  if (!cover) {
    return res.status(404).json({ error: "Cover not found" })
  }
  const filePath = join(env.NEXT_PUBLIC_MUSIC_LIBRARY_FOLDER, cover.path)
  res
    .status(200)
    .setHeader("Content-Type", cover.mimetype)
  return createReadStream(filePath)
    .pipe(res)
}