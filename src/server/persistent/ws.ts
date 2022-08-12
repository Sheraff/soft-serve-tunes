import { env } from "../../env/server.mjs"
import { ServerOptions, WebSocketServer, WebSocket } from 'ws'

class MyWebSocketServer extends WebSocketServer {

	alive = new WeakMap<WebSocket, boolean>()
	isAlive(ws: WebSocket) {
		return this.alive.get(ws) === true
	}

	actors: Map<string, (ws: WebSocket, payload: unknown) => void> = new Map()
	registerActor(name: string, actor: (ws: WebSocket, payload: unknown) => void) {
		this.actors.set(name, actor)
	}

	send(type: string, payload?: unknown) {
		this.clients.forEach((ws) => {
			ws.send(JSON.stringify({type, payload}))
		})
	}

	constructor(options: ServerOptions) {
		super(options)
		this.on('connection', (ws) => {
			// ping
			this.alive.set(ws, true)
			ws.on('pong', () => this.alive.set(ws, true))

			// logs
			console.log(`\x1b[35mevent\x1b[0m - WebSocket Connection ++ (${this.clients.size})`)
			ws.once('close', () => {
				console.log(`\x1b[35mevent\x1b[0m - WebSocket Connection -- (${this.clients.size})`)
			})

			// messages
			ws.on('message', (message) => {
				try {
					const {type, payload} = JSON.parse(message.toString())
					const actor = this.actors.get(type)
					if (actor) {
						actor(ws, payload)
					} else {
						console.log(`\x1b[31merror\x1b[0m - WebSocket unknown message type: ${type}`)
					}
				} catch {
					console.log(`\x1b[31merror\x1b[0m - WebSocket invalid message`)
				}
			})
		})
		this.on('error', (error) => {
			console.log(`\x1b[31merror\x1b[0m - WebSocketServer error: ${error}`)
		})
		this.on('listening', () => {
			console.log(`\x1b[32mready\x1b[0m - WebSocketServer listening on ws://localhost:${options.port}`);
		})

		const interval = setInterval(() => {
			this.clients.forEach((ws) => {
				if (this.alive.get(ws) === false)
					return ws.terminate()

				this.alive.set(ws, false)
				ws.ping()
			})
		}, 30000)

		this.on('close', () => {
			clearInterval(interval)
		})
	}
}

declare global {
	var socketServer: MyWebSocketServer | null;
}

export const socketServer = globalThis.socketServer
	|| new MyWebSocketServer({
		port: env.NEXT_PUBLIC_WEBSOCKET_PORT,
	})

if (env.NODE_ENV !== "production") {
	globalThis.socketServer = socketServer
}
