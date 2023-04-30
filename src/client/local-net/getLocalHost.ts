import { env } from "env/client.mjs"

let lastLocalHostCheck = 0

export async function getLocalHost () {
	if (!canConnectLocally()) return
	const now = Date.now()
	if (now - lastLocalHostCheck < 30_000) return
	lastLocalHostCheck = now
	const remoteResponse = await fetch("/api/ip")
	if (!remoteResponse.ok) return
	const { host } = await remoteResponse.json() as { host: string }
	const localResponse = await fetch(`${host}/api/local/ping`, { method: "HEAD" })
	if (!localResponse.ok) return
	return host
}

function canConnectLocally () {
	if (env.NEXT_PUBLIC_ENV === "development") return true
	const connection = (navigator as unknown as { connection: { type: string | undefined } }).connection.type
	return connection === "wifi"
}