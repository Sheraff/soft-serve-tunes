import SocketServerEmitter from "./SocketServerEmitter"

const router = {
	loading(data: number) {
		return data
	},
	invalidate(data: {
		type: "track" | "album" | "artist" | "playlist",
		id: string
	}) {
		return data
	},
	add(data: {
		type: "track" | "album" | "artist" | "playlist",
		id: string
	}) {
		return data
	},
	remove(data: {
		type: "track" | "album" | "artist" | "playlist" | "genre",
		id: string
	}) {
		return data
	},
	metrics(data: {
		type: "listen-count" | "likes",
	}) {
		return data
	},
	upload(data: number) {
		return data
	},
	console(data: {
		type?: "log" | "warn" | "error",
		message: any
	}) {
		return {
			type: data.type ?? "log",
			message: data.message
		}
	}
}

export type Router = typeof router

// @ts-expect-error -- declaring a global for persisting the instance, but not a global type because it must be imported
export const socketServer = (globalThis.socketServerEmitter || new SocketServerEmitter(router)) as InstanceType<typeof SocketServerEmitter<Router>>
// @ts-expect-error -- see above
globalThis.socketServerEmitter = socketServer
