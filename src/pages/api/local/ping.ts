import type { NextApiRequest, NextApiResponse } from "next"
import { getLocalNetworkAuth } from "server/common/local-auth"

export default async function local (req: NextApiRequest, res: NextApiResponse) {
	const isLocal = getLocalNetworkAuth(req)
	if (!isLocal) {
		res.status(401).json({ error: "reserved for intranet access" })
		return
	}
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.status(204).end()
}