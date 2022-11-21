import { useEffect } from "react"
import { useQueryClient } from "react-query"
import { env } from "env/client.mjs"
import revalidateSwCache from "client/sw/revalidateSwCache"

export default function WatcherSocket() {
	const queryClient = useQueryClient()

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
		const controller = new AbortController()
		const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
		socket.addEventListener("message", (e) => {
			const data = JSON.parse(e.data)
			if (data.type === "watcher:add") {
				console.log("added track")
				revalidateSwCache("track.searchable")
				revalidateSwCache("artist.searchable")
				revalidateSwCache("album.searchable")
				revalidateSwCache("genre.list")
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
			} else if (data.type === "global:message") {
				console[data.payload?.level || 'log'](data.payload.message)
			}
		}, {signal: controller.signal})
		return () => {
			controller.abort()
			socket.close()
		}
	}, [queryClient])

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
					queryClient.invalidateQueries(['sw-cached-track', id])
				} else if (message.type === 'sw-trpc-invalidation') {
					const queryKey = [message.payload.key]
					if (message.payload.params) {
						queryKey.push(message.payload.params)
					}
					queryClient.invalidateQueries(queryKey)
				}
			}, {signal: controller.signal})
		})
		return () => {
			controller.abort()
		}
	}, [queryClient])

	return null
}