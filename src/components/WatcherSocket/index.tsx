import { useEffect } from "react"
import { env } from "env/client.mjs"
import revalidateSwCache from "client/sw/revalidateSwCache"
import { trpc } from "utils/trpc"

function onWsMessageData(data: any) {
	if (data.type === "watcher:add") {
		console.log("added track", data.payload)
		revalidateSwCache("track.searchable")
		revalidateSwCache("artist.searchable")
		revalidateSwCache("album.searchable")
		revalidateSwCache("genre.list")
		if (data.payload?.artistId) {
			revalidateSwCache("artist.miniature", {id: data.payload.artistId})
			revalidateSwCache("artist.get", {id: data.payload.artistId})
			revalidateSwCache("playlist.generate", { type: 'artist', id: data.payload.artistId })
		}
		if (data.payload?.albumId) {
			revalidateSwCache("album.miniature", {id: data.payload.albumId})
			revalidateSwCache("album.get", {id: data.payload.albumId})
			revalidateSwCache("playlist.generate", { type: 'album', id: data.payload.albumId })
		}
	} else if (data.type === "watcher:add-playlist") {
		console.log("added playlist")
		revalidateSwCache("playlist.list")
		revalidateSwCache("playlist.searchable")
	} else if (data.type === "watcher:remove-playlist") {
		console.log("removed playlist")
		revalidateSwCache("playlist.list")
		revalidateSwCache("playlist.searchable")
		revalidateSwCache("playlist.get", { id: data.payload.id })
	} else if (data.type === "watcher:remove") {
		console.log("removed", data.payload)
		if (data.payload?.track) {
			revalidateSwCache("track.searchable")
			revalidateSwCache("track.miniature", {id: data.payload.track.id})
			revalidateSwCache("playlist.generate", { type: 'track', id: data.payload.track.id })
		}
		if (data.payload?.artist) {
			revalidateSwCache("artist.searchable")
			revalidateSwCache("artist.miniature", {id: data.payload.artist.id})
			revalidateSwCache("artist.get", {id: data.payload.artist.id})
			revalidateSwCache("playlist.generate", { type: 'artist', id: data.payload.artist.id })
		}
		if (data.payload?.album) {
			revalidateSwCache("album.searchable")
			revalidateSwCache("album.miniature", {id: data.payload.album.id})
			revalidateSwCache("album.get", {id: data.payload.album.id})
			revalidateSwCache("playlist.generate", { type: 'album', id: data.payload.album.id })
		}
		if (data.payload?.genre) {
			revalidateSwCache("genre.list")
			revalidateSwCache("genre.get", {id: data.payload.genre.id})
			revalidateSwCache("playlist.generate", { type: 'genre', id: data.payload.genre.id })
		}
	} else if (data.type === "invalidate:track") {
		console.log("invalidate track", data.payload)
		revalidateSwCache("track.miniature", {id: data.payload.id})
	} else if (data.type === "invalidate:album") {
		console.log("invalidate album", data.payload)
		revalidateSwCache("album.miniature", {id: data.payload.id})
		revalidateSwCache("album.get", {id: data.payload.id})
	} else if (data.type === "invalidate:artist") {
		console.log("invalidate artist", data.payload)
		revalidateSwCache("artist.miniature", {id: data.payload.id})
		revalidateSwCache("artist.get", {id: data.payload.id})
	} else if (data.type === "invalidate:playlist") {
		console.log("invalidate playlist", data.payload)
		revalidateSwCache("playlist.get", {id: data.payload.id})
		revalidateSwCache("playlist.searchable")
	} else if (data.type === "global:message") {
		// @ts-expect-error -- web socket messages aren't typed
		console[data.payload?.level || 'log'](data.payload.message)
	}
}

export default function WatcherSocket() {
	const trpcClient = trpc.useContext()

	useEffect(() => {
		revalidateSwCache("track.searchable")
		revalidateSwCache("artist.searchable")
		revalidateSwCache("album.searchable")
		revalidateSwCache("genre.list")
		revalidateSwCache("artist.most-fav")
		revalidateSwCache("artist.most-recent-listen")
		revalidateSwCache("artist.least-recent-listen")
		revalidateSwCache("album.most-fav")
		revalidateSwCache("album.most-recent-listen")
		revalidateSwCache("album.most-recent-add")
		revalidateSwCache("genre.most-fav")
	}, [])

	useEffect(() => {
		let socket: WebSocket
		let backOff = 1
		let timeoutId: ReturnType<typeof setTimeout> | null = null
		const onOnline = () => startConnection()
		const onOffline = () => socket?.close()
		const startConnection = () => {
			if (!navigator.onLine) {
				addEventListener('online', onOnline, {once: true})
				return
			}
			addEventListener('offline', onOffline, {once: true})
			socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
			socket.onopen = () => {
				backOff = 1
			}
			socket.onmessage = (e) => {
				const data = JSON.parse(e.data)
				onWsMessageData(data)
			}
			socket.onclose = () => {
				timeoutId = setTimeout(() => {
					startConnection()
				}, backOff * 1_000)
				backOff *= 2
			}
		}
		startConnection()
		return () => {
			if (socket) {
				socket.onclose = null
				socket.close()
			}
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
			removeEventListener('online', onOnline)
			removeEventListener('offline', onOffline)
		}
	}, [])

	useEffect(() => {
		const controller = new AbortController()
		navigator.serviceWorker.ready.then((registration) => {
			const target = registration.active
			if (!target) {
				return
			}
			navigator.serviceWorker.addEventListener("message", (event) => {
				const message = event.data
				if (message.type === 'sw-notify-when-track-cached') {
					const id = message.payload.url.split('/').at(-1)
					trpcClient.queryClient.invalidateQueries(['sw-cached-track', id])
				} else if (message.type === 'sw-trpc-invalidation') {
					const queryKey = [message.payload.key]
					if (message.payload.params) {
						queryKey.push(message.payload.params)
					}
					trpcClient.invalidateQueries(queryKey)
				}
			}, {signal: controller.signal})
		})
		return () => {
			controller.abort()
		}
	}, [trpcClient])

	useEffect(() => {
		const onOnline = async () => {
			const registration = await navigator.serviceWorker.ready
			const target = registration.active
			if (!target) {
				return
			}
			target.postMessage({type: 'sw-trpc-offline-post'})
		}
		addEventListener('online', onOnline)
		return () => {
			removeEventListener('online', onOnline)
		}
	}, [])

	return null
}