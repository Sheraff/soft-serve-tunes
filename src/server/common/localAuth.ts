import { NextApiRequest } from "next"

type LocalClient = {
	host: string
	viewport: number
	dpr: number
	ip: string
	id: string
}

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const localRegisteredClients = (globalThis.localRegisteredClients || new Map()) as Map<string, LocalClient>
// @ts-expect-error -- see above
globalThis.localRegisteredClients = localRegisteredClients

export function getRegisteredLocalClients () {
	console.log("asking for clients", localRegisteredClients.size)
	return localRegisteredClients
}


export function registerClient (req: NextApiRequest) {
	console.log("requesting client registration")
	const ip = req.socket.remoteAddress
	if (!ip) {
		return
	}
	const isLocal = isLocalNetworkIp(ip)
	if (!isLocal) {
		return
	}
	const id = Math.random().toString(36).slice(2)
	const dpr = req.headers["sec-ch-dpr"] || req.query["dpr"]
	const viewport = req.headers["sec-ch-viewport-width"] || req.query["viewport"]
	const host = req.headers["host"] || req.headers["referer"]

	if (!dpr || Array.isArray(dpr)) return
	if (!viewport || Array.isArray(viewport)) return
	if (!host) return

	localRegisteredClients.set(id, {
		host,
		viewport: Number(viewport),
		dpr: Number(dpr),
		ip,
		id,
	})

	console.log("registered ------------------- ", localRegisteredClients.size)
	return id
}

function unregisterClient (req: NextApiRequest): boolean {
	const client = getKnownClient(req)
	if (!client) {
		return false
	}

	localRegisteredClients.delete(client.id)

	return true
}

export function getKnownClient (req: NextApiRequest, forcedId?: string) {
	const id = forcedId || req.query.registrationId
	if (!id || Array.isArray(id)) {
		console.log("no id")
		return
	}
	console.log("id", id)

	const client = localRegisteredClients.get(id)
	if (!client) {
		console.log("no client")
		return
	}
	// if (client.host !== req.headers["host"]) {
	// 	console.log("host mismatch", client.host, req.headers["host"])
	// 	return
	// }
	if (client.ip !== req.socket.remoteAddress) {
		console.log("ip mismatch", client.ip, req.socket.remoteAddress)
		return
	}

	return client
}

function isLocalNetworkIp (ip: string) {
	return ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.0.") || ip.startsWith("0.0.")
}