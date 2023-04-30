import type { NextApiRequest, NextApiResponse } from "next"
import { getKnownClient } from "server/common/localAuth"

export default async function local (req: NextApiRequest, res: NextApiResponse) {
	const id = req.query.registrationId
	if (typeof id !== "string") {
		res.status(400).json({ error: "registrationId is required" })
		return
	}
	if (req.method === "OPTIONS") {
		res.status(200).end()
		return
	}
	const client = getKnownClient(req, id)
	if (!client) {
		res.status(404).json({ error: "registration not found" })
		return
	}
	res.setHeader("Access-Control-Allow-Origin", `http://${client.host}`)
	res.setHeader("Set-Cookie", `local-client-id=${id}; Path=/; HttpOnly; SameSite=Lax;`)
	res.status(204).end()
}