import type { NextApiRequest, NextApiResponse } from "next"
import { getServerAuthSession } from "server/common/get-server-auth-session"
import { getKnownClient } from "server/common/localAuth"

export async function isAuthed (req: NextApiRequest, res: NextApiResponse) {
	const client = getKnownClient(req)
	if (client) {
		res.setHeader("Access-Control-Allow-Origin", `http://${client.host}`)
		return client
	}
	const session = await getServerAuthSession({ req, res })
	if (session && session.user) {
		return true
	}
	return false
}

export default async function getServerAuth (req: NextApiRequest, res: NextApiResponse) {
	const client = await isAuthed(req, res)
	if (!client) {
		res.status(401).json({ error: "authentication required" })
		return false
	}
	if (client !== true) {
		req.headers["sec-ch-dpr"] = String(client.dpr)
		req.headers["sec-ch-viewport-width"] = String(client.viewport)
	}
	return true
}