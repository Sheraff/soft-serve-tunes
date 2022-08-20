import { useEffect } from "react"
import { useQueryClient } from "react-query"
import { env } from "../../env/client.mjs"

export default function WatcherSocket() {
	const queryClient = useQueryClient()
	useEffect(() => {
		const controller = new AbortController()
		const socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
		socket.addEventListener("message", (e) => {
			const data = JSON.parse(e.data)
			if (data.type === "watcher:add") {
				console.log("added track")
				queryClient.invalidateQueries(["track.searchable"])
				queryClient.invalidateQueries(["artist.searchable"])
				queryClient.invalidateQueries(["album.searchable"])
				queryClient.invalidateQueries(["genre.list"])
			} else if (data.type === "watcher:remove") {
				console.log("removed", data.payload)
				if (data.payload?.track) {
					queryClient.invalidateQueries(["track.searchable"])
					queryClient.invalidateQueries(["track.miniature"])
					queryClient.invalidateQueries(["playlist.generate", { type: 'track', id: data.payload.track.id }])
				}
				if (data.payload?.artist) {
					queryClient.invalidateQueries(["artist.searchable"])
					queryClient.invalidateQueries(["artist.miniature", {id: data.payload.artist.id}])
					queryClient.invalidateQueries(["artist.get", {id: data.payload.artist.id}])
					queryClient.invalidateQueries(["playlist.generate", { type: 'artist', id: data.payload.artist.id }])
				}
				if (data.payload?.album) {
					queryClient.invalidateQueries(["album.searchable"])
					queryClient.invalidateQueries(["album.miniature", {id: data.payload.album.id}])
					queryClient.invalidateQueries(["album.get", {id: data.payload.album.id}])
					queryClient.invalidateQueries(["playlist.generate", { type: 'album', id: data.payload.album.id }])
				}
				if (data.payload?.genre) {
					queryClient.invalidateQueries(["genre.list"])
					queryClient.invalidateQueries(["genre.get", {id: data.payload.genre.id}])
					queryClient.invalidateQueries(["playlist.generate", { type: 'genre', id: data.payload.genre.id }])
				}
			} else if (data.type === "global:message") {
				console[data.payload?.level || 'log'](data.payload.message)
			}
		}, {signal: controller.signal})
		return () => {
			controller.abort()
			socket.close()
		}
	}, [queryClient])
	return null
}