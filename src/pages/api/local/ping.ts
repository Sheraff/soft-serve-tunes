import { env } from "env/server.mjs"
import type { NextApiRequest, NextApiResponse } from "next"
import { getLocalNetworkAuth } from "server/common/local-auth"

export default async function local (req: NextApiRequest, res: NextApiResponse) {
	res.setHeader("Access-Control-Allow-Origin", env.NEXT_PUBLIC_INTERNET_HOST)
	const isLocal = getLocalNetworkAuth(req)
	if (!isLocal) {
		res.status(401).json({ error: "reserved for intranet access", ip: req.socket.remoteAddress })
		return
	}
	res.status(204).end()
}