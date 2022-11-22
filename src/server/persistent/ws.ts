import { env } from "env/server.mjs"
import { ServerOptions, WebSocketServer, WebSocket } from 'ws'

class MyWebSocketServer extends WebSocketServer {

	alive = new WeakMap<WebSocket, boolean>()
	isAlive(ws: WebSocket) {
		return this.alive.get(ws) === true
	}

	actors: Map<string, (ws: WebSocket, payload: any) => void> = new Map()
	registerActor<T>(name: string, actor: (ws: WebSocket, payload: T) => void) {
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
					const string = message.toString()
					if (string === '') {
						ws.send('')
						return
					}
					const {type, payload} = JSON.parse(string)
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
		}, 30_000)

		this.on('close', () => {
			clearInterval(interval)
		})
	}
}

declare global {
	// eslint-disable-next-line no-var
	var socketServer: MyWebSocketServer | null;
}

export const socketServer = globalThis.socketServer
	|| new MyWebSocketServer({
		port: env.WEBSOCKET_SERVER_PORT,
	})

// if (env.NODE_ENV !== "production") {
	globalThis.socketServer = socketServer
// }
