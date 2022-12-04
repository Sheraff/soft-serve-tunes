import { env } from "env/server.mjs"
import EventEmitter from "events"
import log from "utils/logger"
import { WebSocketServer, type WebSocket } from "ws"

export default class SocketServerEmitter<
	Router extends Record<Route, (...args: any) => any>,
	Route extends string = keyof Router & string,
> {
	#emitter: EventEmitter
	#server: WebSocketServer
	#alive = new WeakMap<WebSocket, boolean>()

	constructor(router: Router) {
		this.#emitter = new EventEmitter()
		const routes = Array.from(Object.entries(router)) as [Route, Router[Route]][]
		routes.forEach(([event, listener]) => {
			this.#emitter.on(event, (...args) => {
				const data = listener(...args)
				this.#send(event, data)
			})
		})

		this.#server = new WebSocketServer({
			port: env.WEBSOCKET_SERVER_PORT,
			// noServer: true,
		})
		this.#initSocket()
	}

	#send(type: string, payload?: unknown) {
		const message = JSON.stringify({type, payload})
		this.#server.clients.forEach((ws) => {
			ws.send(message)
		})
	}

	#initSocket() {
		this.#server.on('connection', (ws) => {
			// ping
			this.#alive.set(ws, true)
			ws.on('pong', () => this.#alive.set(ws, true))

			// logs
			log("event", "event", `WebSocket Connection ++ (${this.#server.clients.size})`)
			ws.once('close', () => {
				log("event", "event", `WebSocket Connection -- (${this.#server.clients.size})`)
			})

			Object.entries(this.#initialMap).forEach(([type, payload]) => {
				ws.send(JSON.stringify({type, payload}))
			})
		})
		this.#server.on('error', (error) => {
			log("error", "error", `WebSocketServer error: ${error}`)
		})
		this.#server.on('listening', () => {
			log("ready", "ready", `WebSocketServer listening on ws://localhost:${env.WEBSOCKET_SERVER_PORT}`);
		})

		const interval = setInterval(() => {
			this.#server.clients.forEach((ws) => {
				if (this.#alive.get(ws) === false)
					return ws.terminate()

				this.#alive.set(ws, false)
				ws.ping()
			})
		}, 30_000)

		this.#server.on('close', () => {
			clearInterval(interval)
		})
	}

	emit<K extends Route>(event: K, data: Parameters<Router[K]>[0]) {
		return this.#emitter.emit(event, data)
	}

	#initialMap: Record<Route, ReturnType<Router[Route]>> = {} as any
	onConnection<K extends Route>(event: K, data: Parameters<Router[K]>[0]) {
		return this.#send(event, data)
	}
}