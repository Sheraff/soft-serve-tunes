import { useEffect } from "react"
import revalidateSwCache from "client/sw/revalidateSwCache"
import { trpc } from "utils/trpc"
import Socket from "client/ws/socket"

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
		const controller = new AbortController()
		const socket = new Socket()

		socket.addEventListener("watcher:add", () => {
			console.log("added track")
			revalidateSwCache("track.searchable")
			revalidateSwCache("artist.searchable")
			revalidateSwCache("album.searchable")
			revalidateSwCache("genre.list")
		}, {signal: controller.signal})

		socket.addEventListener("watcher:add", ({detail}) => {
			console.log("removed", detail)
			if (detail?.track) {
				revalidateSwCache("track.searchable")
				revalidateSwCache("track.miniature", {id: detail.track.id})
				revalidateSwCache("playlist.generate", { type: 'track', id: detail.track.id })
			}
			if (detail?.artist) {
				revalidateSwCache("artist.searchable")
				revalidateSwCache("artist.miniature", {id: detail.artist.id})
				revalidateSwCache("artist.get", {id: detail.artist.id})
				revalidateSwCache("playlist.generate", { type: 'artist', id: detail.artist.id })
			}
			if (detail?.album) {
				revalidateSwCache("album.searchable")
				revalidateSwCache("album.miniature", {id: detail.album.id})
				revalidateSwCache("album.get", {id: detail.album.id})
				revalidateSwCache("playlist.generate", { type: 'album', id: detail.album.id })
			}
			if (detail?.genre) {
				revalidateSwCache("genre.list")
				revalidateSwCache("genre.get", {id: detail.genre.id})
				revalidateSwCache("playlist.generate", { type: 'genre', id: detail.genre.id })
			}
		}, {signal: controller.signal})

		socket.addEventListener("invalidate:track", ({detail}) => {
			console.log("invalidate track", detail)
			revalidateSwCache("track.miniature", {id: detail.id})
		}, {signal: controller.signal})
		
		socket.addEventListener("invalidate:album", ({detail}) => {
			console.log("invalidate album", detail)
			revalidateSwCache("album.miniature", {id: detail.id})
			revalidateSwCache("album.get", {id: detail.id})
		}, {signal: controller.signal})
		
		socket.addEventListener("invalidate:artist", ({detail}) => {
			console.log("invalidate artist", detail)
			revalidateSwCache("artist.miniature", {id: detail.id})
			revalidateSwCache("artist.get", {id: detail.id})
		}, {signal: controller.signal})
		
		socket.addEventListener("global:message", ({detail}) => {
			console[detail?.level || 'log'](detail.message)
		}, {signal: controller.signal})

		return () => {
			controller.abort()
			socket.close()
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