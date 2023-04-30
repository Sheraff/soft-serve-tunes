import os from "node:os"

import type { NextApiRequest, NextApiResponse } from "next"
import getServerAuth from "server/common/server-auth"
import { registerClient } from "server/common/localAuth"

export default async function ip (req: NextApiRequest, res: NextApiResponse) {
	if (!await getServerAuth(req, res)) {
		return
	}

	const registrationId = registerClient(req)
	if (!registrationId) {
		res.setHeader("Critical-CH", "sec-ch-dpr, sec-ch-viewport-width")
		res.status(409).json({ error: "client and server are on different local networks" })
		return
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

	// TODO: do a better job at selecting the address? (prefer eth)
	const address = addresses[0]
	if (!address) {
		res.status(500).json({ error: "no local network address found" })
		return
	}

	const host = `${address}:3000`

	// res.setHeader("Set-Cookie", `local-client-id=${registrationId}; Path=/; HttpOnly; SameSite=None; Secure`)
	res.status(200).json({ host, registrationId })
}