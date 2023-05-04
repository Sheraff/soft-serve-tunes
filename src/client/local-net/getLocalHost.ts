import { env } from "env/client.mjs"

let lastLocalHostCheck = 0

export async function getLocalHost () {
	if (!canConnectLocally()) return
	const now = Date.now()
	if (now - lastLocalHostCheck < 30_000) return
	lastLocalHostCheck = now

	const localResponse = await fetch(`${env.NEXT_PUBLIC_INTRANET_HOST}/api/local/ping`, { method: "HEAD" })
	if (!localResponse.ok) {
		return
	}
	return env.NEXT_PUBLIC_INTRANET_HOST
}

function canConnectLocally () {
	if (!env.NEXT_PUBLIC_INTRANET_HOST) return false
	if (env.NEXT_PUBLIC_ENV === "development") return true
	const connection = (navigator as unknown as { connection: { type: string | undefined } }).connection.type
	return connection === "wifi"
}