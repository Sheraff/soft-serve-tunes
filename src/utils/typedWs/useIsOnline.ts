import { useState, useEffect, startTransition } from "react"
import { globalWsClient } from "./react-client"

export default function useIsOnline () {
	const [isOnline, setIsOnline] = useState(globalWsClient.wsClient?.serverState !== false)
	useEffect(() => {
		const listener = (online: boolean) => startTransition(() => setIsOnline(online))
		globalWsClient.wsClient!.addConnectionListener(listener)
		return () => {
			globalWsClient.wsClient!.removeConnectionListener(listener)
		}
	}, [])
	return isOnline
}