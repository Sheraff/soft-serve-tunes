import os from "node:os"

import { getServerAuthSession } from "server/common/get-server-auth-session"
import type { NextApiRequest, NextApiResponse } from "next"
import { getCsrfHash } from "server/csrfAuth"
import { getCsrfToken } from "next-auth/react"

export default async function ip (req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerAuthSession({ req, res })
	if (!session) {
		return res.status(401).json({ error: "authentication required" })
	}
	const interfaces = os.networkInterfaces()
	const addresses = []
	for (const k in interfaces) {
		const _interface = interfaces[k]!
		for (const k2 in _interface) {
			const address = _interface[k2]!
			if (address.family === 'IPv4' && !address.internal) {
				addresses.push(address.address)
			}
		}
	}

	console.log("from /ip", req.query.token)

	const csrfToken = await getCsrfToken({ req })
	const hash = getCsrfHash(csrfToken)

	res.status(200).json({ addresses, hash })
}