import type { NextApiRequest, NextApiResponse } from "next"
import { prisma } from "../../../server/db/client"

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
  const {id} = req.query
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: "Missing id" })
  }
  const cover = await prisma.cover.findUnique({
    where: { id },
    select: { data: true, mime: true },
  })
  if (!cover) {
    return res.status(404).json({ error: "Cover not found" })
  }
  return res
    .status(200)
    .setHeader("Content-Type", cover.mime)
    .send(cover.data)
}