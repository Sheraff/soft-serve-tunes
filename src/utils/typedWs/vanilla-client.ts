import type { Router } from "./server"
import SocketClient from "./SocketClient"

const wsClient = new SocketClient<Router>()

type Subscription<K extends keyof Router> = (params: {
	onData: (data: ReturnType<Router[K]>) => void
	enabled?: boolean
	onError?: (error: Event) => void
}) => void

function makeSubscription<K extends keyof Router> (prop: K): Subscription<K> {
	return ({ onData, onError }) => {
		const controller = new AbortController()
		wsClient.target.addEventListener(prop, (event) => {
			if (!(event instanceof CustomEvent)) return
			const payload = event.detail as ReturnType<Router[K]>
			onData(payload)
		}, {
			signal: controller.signal,
			passive: true,
		})
		wsClient.target.addEventListener("__socket-client-error__", (event) => {
			if (!onError) return
			onError(event)
		}, {
			signal: controller.signal,
			passive: true,
		})
		return () => controller.abort()
	}
}

export const workerSocketController = {
	switchToLocalSocket: wsClient.switchToLocalSocket.bind(wsClient),
	switchToRemoteSocket: wsClient.switchToRemoteSocket.bind(wsClient),
}

export const workerSocketClient = new Proxy({}, {
	get<K extends keyof Router> (_: any, prop: K) {
		const subscribe = makeSubscription(prop)
		return {
			subscribe
		}
	}
}) as {
		[K in keyof Router]: {
			subscribe: Subscription<K>
		}
	}
