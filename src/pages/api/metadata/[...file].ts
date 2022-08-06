import type { NextApiRequest, NextApiResponse } from "next"
import { parseFile } from 'music-metadata'
import getRequestFile from "../../../server/utils/getRequestFile"

export default async function file(req: NextApiRequest, res: NextApiResponse) {
  const {file} = req.query
  const data = await getRequestFile(file, res)
  if (!data)
    return
  const {path} = data

  const metadata = await parseFile(path)
  res.json({
    common: metadata.common,
    format: metadata.format,
  })
}