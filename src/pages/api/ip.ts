import os from "node:os"

import type { NextApiRequest, NextApiResponse } from "next"
import { getServerAuthSession } from "server/common/get-server-auth-session"
import { env } from "env/server.mjs"

export default async function ip (req: NextApiRequest, res: NextApiResponse) {
	const session = await getServerAuthSession({ req, res })
	if (!session) {
		res.status(401).json({ error: "authentication required" })
		return
	}

	const interfaces = os.networkInterfaces()
	const addresses = []
	let addressesLog = ""
	for (const k in interfaces) {
		const _interface = interfaces[k]!
		for (const k2 in _interface) {
			const address = _interface[k2]!
			if (address.family === 'IPv4' && !address.internal) {
				addressesLog += `${k}->${k2}   ${address.address} ${address.family} ${address.internal}\n`
				addresses.push(address.address)
			}
		}
	}
	console.log(addressesLog)

	// TODO: do a better job at selecting the address? (prefer eth)
	const address = addresses[0]
	if (!address) {
		res.status(500).json({ error: "no local network address found" })
		return
	}

	const host = `http://${address}:${env.SERVER_PORT}`
	res.status(200).json({ host })
}