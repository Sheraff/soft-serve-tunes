import { useState, useEffect } from "react"
import { globalWsClient } from "./react-client"

export default function useIsOnline() {
	const [isOnline, setIsOnline] = useState(globalWsClient.wsClient?.serverState !== false)
	useEffect(() => {
		globalWsClient.wsClient!.addConnectionListener(setIsOnline)
		return () => {
			globalWsClient.wsClient!.removeConnectionListener(setIsOnline)
		}
	}, [])
	return isOnline
}