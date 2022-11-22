import { env } from "env/client.mjs"

class Socket extends EventTarget {
	static instance: Socket | null = null
	static count = 0

	// @ts-expect-error -- singleton requires some bypass of constructor
	ws: WebSocket
	// @ts-expect-error -- singleton requires some bypass of constructor
	send: (message: string) => void
	open = false
	intervalId: ReturnType<typeof setInterval> | null = null
	isAlive = false
	reopenTimeout: ReturnType<typeof setTimeout> | null = null

	constructor() {
		Socket.count++
		if (Socket.instance) {
			return Socket.instance
		}
		super()
		Socket.instance = this
		this.send = this.#closeSend
		this.#initWs()
	}

	#initWs() {
		this.ws = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
		this.ws.onclose = () => {
			this.isAlive = false
			this.send = this.#closeSend
			if (this.intervalId) {
				clearInterval(this.intervalId)
				this.intervalId = null
			}
			this.reopenTimeout = setTimeout(() => {
				this.#initWs()
			}, 10_000)
		}
		this.ws.onopen = () => {
			this.isAlive = true
			this.open = true
			this.queue.forEach(message => this.#openSend(message))
			this.queue.length = 0
			this.send = this.#openSend
			this.intervalId = setInterval(() => {
				if (!this.isAlive) {
					console.log('server offline')
				}
				this.ws.send('')
			}, 10_000) // client-side ping
		}
		this._onMessage = this._onMessage.bind(this)
		this.ws.addEventListener('message', this._onMessage)
	}

	queue: string[] = []
	#closeSend(message: string) {
		this.queue.push(message)
	}
	#openSend(message: string) {
		this.ws.send(message)
	}

	close() {
		Socket.count--
		if (Socket.count === 0) {
			this.ws.onclose = null
			this.ws.close()
			Socket.instance = null
			this.ws.removeEventListener('message', this._onMessage)
			if (this.intervalId) {
				clearInterval(this.intervalId)
				this.intervalId = null
			}
			if (this.reopenTimeout) {
				clearTimeout(this.reopenTimeout)
				this.reopenTimeout = null
			}
		}
	}

	_onMessage(event: MessageEvent) {
		if (event.data === '') {
			this.isAlive = true
			console.log('pong from server')
			return
		}
		const {type, payload} = JSON.parse(event.data)
		this.dispatchEvent(new CustomEvent(type, {detail: payload}))
	}

}

export default Socket