import { useEffect, useRef } from "react"
import type { Router } from "./server"
import SocketClient from "./SocketClient"

const wsClient = new SocketClient<Router>()

type UseSubscription<K extends keyof Router> = (params: {
	onData: (data: ReturnType<Router[K]>) => void
	enabled?: boolean
	onError?: (error: Event) => void
}) => void

function makeUseSubscription<K extends keyof Router>(prop: K): UseSubscription<K> {
	return ({onData, enabled = true, onError}) => {
		const callbackRef = useRef({onData, onError})
		callbackRef.current = {onData, onError}
		useEffect(() => {
			if (enabled === false) return
			const controller = new AbortController()
			wsClient.target.addEventListener(prop, (event) => {
				if (!(event instanceof CustomEvent)) return
				const payload = event.detail as ReturnType<Router[K]>
				callbackRef.current.onData(payload)
			}, {
				signal: controller.signal,
				passive: true,
			})
			wsClient.target.addEventListener('__socket-client-error__', (event) => {
				if (!callbackRef.current.onError) return
				callbackRef.current.onError(event)
			}, {
				signal: controller.signal,
				passive: true,
			})
			return () => controller.abort()
		}, [enabled])
	}
}

export const socketClient = new Proxy({}, {
	get<K extends keyof Router>(_: any, prop: K) {
		const useSubscription = makeUseSubscription(prop)
		return {
			useSubscription
		}
	}
}) as {
	[K in keyof Router]: {
		useSubscription: UseSubscription<K>
	}
}
