import { NextApiRequest } from "next"

export function getLocalNetworkAuth (req: NextApiRequest) {
	const ip = req.socket.remoteAddress
	if (!ip) {
		return false
	}
	return isLocalNetworkIp(ip)
}

function isLocalNetworkIp (ip: string) {
	return (
		ip === "::1"
		|| ip.startsWith("192.168.")
		|| ip.startsWith("10.0.")
		|| ip.startsWith("0.0.")
		|| ip.startsWith("127.0.")
	)
}