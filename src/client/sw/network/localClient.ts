/// <reference lib="webworker" />

import { workerSocketController } from "utils/typedWs/vanilla-client"

type LocalClient =
	| {
		host: string
		registrationId: string
	}
	| {
		host: null
		registrationId: null
	}

export const localClient: LocalClient = {
	host: null,
	registrationId: null,
}

export async function getServerIp ({ dpr, viewport }: { dpr: number, viewport: number }) {
	const response = await fetch(`/api/ip?dpr=${dpr}&viewport=${viewport}`)
	if (response.status !== 200) return
	const data = await response.json() as { host: string, registrationId: string }
	const handshake = await fetch(`http://${data.host}/api/local?registrationId=${data.registrationId}`)
	if (!handshake.ok) return
	localClient.host = data.host
	localClient.registrationId = data.registrationId
	workerSocketController.switchToLocalSocket(localClient.host)
}