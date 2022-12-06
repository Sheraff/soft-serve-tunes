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
	#onMessage: <K extends Route>(event: MessageEvent<any>) => void

	constructor() {
		if (ssr) {
			this.socket = {} as any
			this.target = {} as any
			this.#onOnline = () => {}
			this.#onOffline = () => {}
			this.#onMessage = () => {}
			return
		}
		this.target = new EventTarget()

		this.#onOnline = () => this.#initSocket()
		this.#onOffline = () => this.socket?.close()
		this.#onMessage = <K extends Route>(event: MessageEvent<any>) => {
			const { type, payload } = JSON.parse(event.data) as {
				type: K,
				payload: ReturnType<Router[K]>
			}
			this.target.dispatchEvent(new CustomEvent(type, { detail: payload }))
		}

		addEventListener('online', this.#onOnline)
		addEventListener('offline', this.#onOffline)
		
		this.#initSocket()
	}

	#backOff = 1
	#timeoutId: ReturnType<typeof setTimeout> | null = null

	#initSocket() {
		if (this.#timeoutId) {
			clearTimeout(this.#timeoutId)
			this.#timeoutId = null
		}

		if (!navigator.onLine) {
			return
		}

		const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
		socket.addEventListener("message", this.#onMessage)

		socket.onopen = () => this.#backOff = 1
		socket.onclose = () => {
			this.#timeoutId = setTimeout(() => {
				this.#initSocket()
			}, this.#backOff * 1_000)
			this.#backOff *= 2
		}
		socket.onerror = (e) => {
			console.error(e)
			this.target.dispatchEvent(new CustomEvent("__socket-client-error__", { detail: e }))
		}

		this.socket = socket
	}

	destroy() {
		if (this.socket){
			this.socket.removeEventListener("message", this.#onMessage)
			this.socket.onclose = null
			this.socket.close()
		}
		if (this.#timeoutId) {
			clearTimeout(this.#timeoutId)
		}
		removeEventListener('online', this.#onOnline)
		removeEventListener('offline', this.#onOffline)
	}
}