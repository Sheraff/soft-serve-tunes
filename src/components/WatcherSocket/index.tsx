import { useEffect } from "react"
import revalidateSwCache from "client/sw/revalidateSwCache"
import { trpc } from "utils/trpc"
import { useQueryClient } from "@tanstack/react-query"
import { socketClient } from "utils/typedWs/client"

export default function WatcherSocket() {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()

	useEffect(() => {
		revalidateSwCache(["track", "searchable"])
		revalidateSwCache(["artist", "searchable"])
		revalidateSwCache(["album", "searchable"])
		revalidateSwCache(["genre", "list"])
		revalidateSwCache(["artist", "mostFav"])
		revalidateSwCache(["artist", "mostRecentListen"])
		revalidateSwCache(["artist", "leastRecentListen"])
		revalidateSwCache(["album", "mostFav"])
		revalidateSwCache(["album", "mostRecentListen"])
		revalidateSwCache(["album", "mostRecentAdd"])
		revalidateSwCache(["genre", "mostFav"])
	}, [])

	socketClient.add.useSubscription({
		onData({type, id}) {
			console.log(`added ${type} ${id}`)
			if (type === "playlist") {
				revalidateSwCache(["playlist", "list"])
				revalidateSwCache(["playlist", "searchable"])
				return
			}
			revalidateSwCache(["track", "searchable"])
			revalidateSwCache(["artist", "searchable"])
			revalidateSwCache(["album", "searchable"])
			revalidateSwCache(["genre", "list"])
			if (type === "artist") {
				revalidateSwCache(["artist", "miniature"], {id})
				revalidateSwCache(["artist", "get"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'artist', id })
			} else if (type === "album") {
				revalidateSwCache(["album", "miniature"], {id})
				revalidateSwCache(["album", "get"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'album', id })
				revalidateSwCache(["album", "mostRecentAdd"])
			}
		}
	})

	socketClient.remove.useSubscription({
		onData({type, id}) {
			console.log(`removed ${type} ${id}`)
			if (type === "playlist") {
				revalidateSwCache(["playlist", "list"])
				revalidateSwCache(["playlist", "searchable"])
				revalidateSwCache(["playlist", "get"], { id })
			} else if (type === "track") {
				revalidateSwCache(["track", "searchable"])
				revalidateSwCache(["track", "miniature"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'track', id })
			} else if (type === "artist") {
				revalidateSwCache(["artist", "searchable"])
				revalidateSwCache(["artist", "miniature"], {id})
				revalidateSwCache(["artist", "get"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'artist', id })
			} else if (type === "album") {
				revalidateSwCache(["album", "searchable"])
				revalidateSwCache(["album", "miniature"], {id})
				revalidateSwCache(["album", "get"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'album', id })
			} else if (type === "genre") {
				revalidateSwCache(["genre", "list"])
				revalidateSwCache(["genre", "miniature"], {id})
				revalidateSwCache(["genre", "get"], {id})
				revalidateSwCache(["playlist", "generate"], { type: 'genre', id })
			}
		}
	})

	socketClient.invalidate.useSubscription({
		onData({type, id}) {
			console.log(`invalidated ${type} ${id}`)
			if (type === "track") {
				revalidateSwCache(["track", "miniature"], {id})
			} else if (type === "album") {
				revalidateSwCache(["album", "miniature"], {id})
				revalidateSwCache(["album", "get"], {id})
			} else if (type === "artist") {
				revalidateSwCache(["artist", "miniature"], {id})
				revalidateSwCache(["artist", "get"], {id})
			} else if (type === "playlist") {
				revalidateSwCache(["playlist", "get"], {id})
				revalidateSwCache(["playlist", "list"])
				revalidateSwCache(["playlist", "searchable"])
			}
		}
	})

	socketClient.metrics.useSubscription({
		onData({type}) {
			console.log(`metrics ${type}`)
			if (type === "listen-count") {
				revalidateSwCache(["artist", "mostRecentListen"])
				revalidateSwCache(["artist", "leastRecentListen"])
				revalidateSwCache(["album", "mostRecentListen"])
			} else if (type === "likes") {
				revalidateSwCache(["artist", "mostFav"])
				revalidateSwCache(["album", "mostFav"])
				revalidateSwCache(["genre", "mostFav"])
			}
		}
	})

	socketClient.console.useSubscription({
		onData({type, message}) {
			console[type](message)
		}
	})

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
					const queryKey = message.payload.key
					const queryParams = {
						type: 'query',
						...(message.payload.params ? {input: message.payload.params} : {}),
					}
					queryClient.invalidateQueries([queryKey, queryParams])
				}
			}, {signal: controller.signal})
		})
		return () => {
			controller.abort()
		}
	}, [trpcClient, queryClient])

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