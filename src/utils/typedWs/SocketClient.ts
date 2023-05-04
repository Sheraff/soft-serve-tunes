import { env } from "env/client.mjs"

const ssr = typeof window === "undefined" && typeof self === "undefined"

export default class SocketClient<
	Router extends Record<Route, (...args: any) => any>,
	Route extends string = keyof Router & string,
> {

	socket: WebSocket | null = null
	target: EventTarget

	#onOnline: () => void
	#onOffline: () => void
	#onFocus: () => void
	#onMessage: <K extends Route>(event: MessageEvent<any>) => void
	#serverStateListeners: Set<(online: boolean) => void> = new Set()
	#socketUrl = env.NEXT_PUBLIC_WEBSOCKET_URL

	constructor() {
		if (ssr) {
			this.socket = {} as any
			this.target = {} as any
			this.#onOnline = () => { }
			this.#onOffline = () => { }
			this.#onFocus = () => { }
			this.#onMessage = () => { }
			this.serverState = false
			return
		}
		this.target = new EventTarget()

		this.#onOnline = () => this.#initSocket()
		this.#onOffline = () => this.socket?.close()
		this.#onFocus = () => this.#retryOnFocus()
		this.#onMessage = <K extends Route> (event: MessageEvent<any>) => {
			if (event.data === "") {
				this.#onPong()
				return
			}
			const { type, payload } = JSON.parse(event.data) as {
				type: K,
				payload: ReturnType<Router[K]>
			}
			this.target.dispatchEvent(new CustomEvent(type, { detail: payload }))
		}

		addEventListener("online", this.#onOnline)
		addEventListener("offline", this.#onOffline)
		this.serverState = navigator.onLine

		this.#initSocket()
	}

	#pongState = true
	#pongIntervalId: ReturnType<typeof setInterval> | null = null
	#onPong () {
		this.#pongState = true
	}

	#backOff = 1
	#timeoutId: ReturnType<typeof setTimeout> | null = null

	#initSocket () {
		if (this.#timeoutId) {
			clearTimeout(this.#timeoutId)
			this.#timeoutId = null
		}
		if (this.#pongIntervalId) {
			clearInterval(this.#pongIntervalId)
			this.#pongIntervalId = null
		}
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", this.#onFocus)
		}

		if (!navigator.onLine) {
			return
		}

		const socket = new WebSocket(this.#socketUrl)
		socket.addEventListener("message", this.#onMessage)

		socket.onopen = () => {
			this.#pongState = true
			this.serverState = true
			this.#backOff = 1

			this.#pongIntervalId = setInterval(() => {
				if (!this.#pongState) {
					socket.close()
					return
				}
				this.#pongState = false
				socket.send("")
			}, 10_000)
		}
		socket.onclose = () => {
			this.serverState = false
			if (this.#pongIntervalId) {
				clearInterval(this.#pongIntervalId)
				this.#pongIntervalId = null
			}
			this.#timeoutId = setTimeout(() => {
				this.#initSocket()
			}, this.#backOff * 1_000)
			this.#backOff *= 2
			if (typeof document !== "undefined") {
				document.addEventListener("visibilitychange", this.#onFocus)
			}
		}
		socket.onerror = (e) => {
			console.log("SocketClient main socket error")
			console.error(e)
			this.target.dispatchEvent(new CustomEvent("__socket-client-error__", { detail: e }))
		}

		this.socket = socket
	}

	switchToLocalSocket (host: string) {
		this.#socketUrl = `ws://${host}`
		this.#backOff = 1
		this.socket?.close()
	}

	switchToRemoteSocket () {
		this.#socketUrl = env.NEXT_PUBLIC_WEBSOCKET_URL
		this.#backOff = 1
		this.socket?.close()
	}

	#retryOnFocus () {
		if (!document.hidden) {
			this.#initSocket()
		}
	}

	#serverState = false
	/**
	 * @description true if the server is online
	 */
	get serverState () {
		return this.#serverState
	}
	set serverState (online: boolean) {
		if (this.#serverState === online) {
			return
		}
		this.#serverState = online
		this.#serverStateListeners.forEach(listener => listener(online))
	}

	addConnectionListener (listener: (online: boolean) => void) {
		this.#serverStateListeners.add(listener)
	}

	removeConnectionListener (listener: (online: boolean) => void) {
		this.#serverStateListeners.delete(listener)
	}

	destroy () {
		if (this.socket) {
			this.socket.removeEventListener("message", this.#onMessage)
			this.socket.onclose = null
			this.socket.close()
		}
		if (this.#timeoutId) {
			clearTimeout(this.#timeoutId)
		}
		if (this.#pongIntervalId) {
			clearInterval(this.#pongIntervalId)
		}
		removeEventListener("online", this.#onOnline)
		removeEventListener("offline", this.#onOffline)
	}
}