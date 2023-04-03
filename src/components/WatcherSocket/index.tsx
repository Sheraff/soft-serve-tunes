import { useEffect } from "react"
import revalidateSwCache from "client/sw/revalidateSwCache"
import { trpc } from "utils/trpc"
import { useQueryClient, hashQueryKey } from "@tanstack/react-query"
import { socketClient } from "utils/typedWs/react-client"
import { env } from "env/client.mjs"

export default function WatcherSocket () {
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

	if (env.NEXT_PUBLIC_ENV === "development") {
		socketClient.console.useSubscription({
			onData ({ type, message }) {
				console[type](message)
			}
		})
	}

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return
		const controller = new AbortController()
		const unsubscribeSet = new Set<() => void>()
		navigator.serviceWorker.ready.then((registration) => {
			const target = registration.active
			if (!target) {
				return
			}
			navigator.serviceWorker.addEventListener("message", (event) => {
				const message = event.data
				if (message.type === "sw-notify-when-track-cached") {
					const id = message.payload.url.split("/").at(-1)
					queryClient.invalidateQueries(["sw-cached-track", id])
					queryClient.invalidateQueries(["sw-first-cached-track"])
				} else if (message.type === "sw-trpc-invalidation") {
					const queryKey = message.payload.key
					const queryParams = {
						type: "query",
						...(message.payload.params ? { input: message.payload.params } : {}),
					}
					if (message.data) {
						if (queryClient.getQueryState([queryKey, queryParams], { type: "inactive" })) {
							queryClient.setQueryData([queryKey, queryParams], message.data)
						} else if (queryClient.getQueryState([queryKey, queryParams], { type: "active" })) {
							const cache = queryClient.getQueryCache()
							const hash = hashQueryKey([queryKey, queryParams])
							const unsubscribe = cache.subscribe((event) => {
								if (event.type === "observerRemoved") {
									if (hashQueryKey(event.query.queryKey) === hash && !event.query.isActive()) {
										unsubscribe()
										unsubscribeSet.delete(unsubscribe)
										queryClient.setQueryData([queryKey, queryParams], message.data)
									}
								} else if (event.type === "updated") {
									if (hashQueryKey(event.query.queryKey) === hash) {
										unsubscribe()
										unsubscribeSet.delete(unsubscribe)
									}
								}
							})
							unsubscribeSet.add(unsubscribe)
						}
					} else {
						queryClient.invalidateQueries([queryKey, queryParams])
					}
				}
			}, { signal: controller.signal })
		})
		return () => {
			unsubscribeSet.forEach((unsubscribe) => unsubscribe())
			controller.abort()
		}
	}, [trpcClient, queryClient])

	useEffect(() => {
		const onOnline = async () => {
			if (!("serviceWorker" in navigator)) return
			const registration = await navigator.serviceWorker.ready
			const target = registration.active
			if (!target) {
				return
			}
			target.postMessage({ type: "sw-trpc-offline-post" })
		}
		addEventListener("online", onOnline)
		return () => {
			removeEventListener("online", onOnline)
		}
	}, [])

	return null
}