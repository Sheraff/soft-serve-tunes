import { env } from "env/client.mjs"

const ssr = typeof window === "undefined"

export default class SocketClient<
	Router extends Record<Route, (...args: any) => any>,
	Route extends string = keyof Router & string,
> {

	socket: WebSocket | null = null
	target: EventTarget

	constructor() {
		if (ssr) {
			this.socket = {} as any
			this.target = {} as any
			return
		}
		this.target = new EventTarget()
		
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
			addEventListener('online', () => this.#initSocket(), {once: true})
			return
		}

		const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
		socket.addEventListener("message", this.#onMessage.bind(this))

		addEventListener('offline', () => this.socket?.close(), {once: true})
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

	#onMessage<K extends Route>(event: MessageEvent<any>) {
		const { type, payload } = JSON.parse(event.data) as {
			type: K,
			payload: ReturnType<Router[K]>
		}
		this.target.dispatchEvent(new CustomEvent(type, { detail: payload }))
	}
}