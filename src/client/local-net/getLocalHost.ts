import { env } from "env/client.mjs"

let lastLocalHostCheck = 0

export async function getLocalHost(skipDelayCheck?: boolean) {
	if (!canConnectLocally()) return
	const now = Date.now()
	if (!skipDelayCheck) {
		if (now - lastLocalHostCheck < 30_000) return
	}
	lastLocalHostCheck = now

	try {
		const localResponse = await fetch(`${env.NEXT_PUBLIC_INTRANET_HOST}/api/local/ping`, {
			method: "HEAD",
			headers: {
				"Content-Type": "application/json" // Forces preflight
			}
		})
		if (!localResponse.ok) {
			return
		}
		return env.NEXT_PUBLIC_INTRANET_HOST
	} catch { }
}

function canConnectLocally() {
	if (!env.NEXT_PUBLIC_INTRANET_HOST) return false
	if (env.NEXT_PUBLIC_ENV === "development") return true
	const connection = (navigator as unknown as { connection: { type: string | undefined } }).connection.type
	return !connection || connection === "wifi"
}