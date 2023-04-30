import { useEffect } from "react"
import revalidateSwCache from "client/sw/revalidateSwCache"
import { trpc } from "utils/trpc"
import { useQueryClient, hashQueryKey, focusManager } from "@tanstack/react-query"
import { socketClient } from "utils/typedWs/react-client"
import { env } from "env/client.mjs"

export default function WatcherSocket () {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()

	// revalidate common "big list" queries when app starts
	useEffect(() => {
		revalidateSwCache(["track", "searchable"])
		revalidateSwCache(["artist", "searchable"])
		revalidateSwCache(["album", "searchable"])
		revalidateSwCache(["genre", "searchable"])
		revalidateSwCache(["artist", "mostFav"])
		revalidateSwCache(["artist", "mostRecentListen"])
		revalidateSwCache(["artist", "leastRecentListen"])
		revalidateSwCache(["album", "mostFav"])
		revalidateSwCache(["album", "mostRecentListen"])
		revalidateSwCache(["album", "mostRecentAdd"])
		revalidateSwCache(["genre", "mostFav"])
	}, [])

	// allow server to log on client console
	if (env.NEXT_PUBLIC_ENV === "development") {
		socketClient.console.useSubscription({
			onData ({ type, message }) {
				console[type](message)
			}
		})
	}

	// clean SW cache when app is out of focus (and stop when it comes back in focus)
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return
		let focused = true
		let active = true
		const onFocusChange = async () => {
			const newFocused = focusManager.isFocused()
			if (focused === newFocused) return
			focused = newFocused
			const registration = await navigator.serviceWorker.ready
			const target = registration.active
			if (!target) return
			const type = focused ? "sw-app-focus" : "sw-app-blur"
			if (!active) return
			target.postMessage({
				type,
				payload: {
					dpr: window.devicePixelRatio,
					viewport: window.innerWidth,
				}
			})
		}
		const unsubscribe = focusManager.subscribe(onFocusChange)
		onFocusChange()
		return () => {
			active = false
			unsubscribe()
		}
	}, [])

	// maintain up-to-date query cache
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return
		const controller = new AbortController()
		const unsubscribeSet = new Set<() => void>()
		navigator.serviceWorker.ready.then((registration) => {
			if (controller.signal.aborted) {
				return
			}
			const target = registration.active
			if (!target) {
				return
			}
			navigator.serviceWorker.addEventListener("message", (event) => {
				const message = event.data
				if (message.type === "sw-notify-when-track-cached") {
					// when SW finishes caching a track, invalidate the query
					const id = message.payload.url.split("/").at(-1)
					queryClient.invalidateQueries(["sw-cached-track", id])
					queryClient.invalidateQueries(["sw-first-cached-track"])
				} else if (message.type === "sw-trpc-invalidation") {
					// when SW receives new data from server, update cache (at a convenient time so user doesn't notice the update)
					const queryKey = message.payload.key
					const queryParams = {
						type: "query",
						...(message.payload.params ? { input: message.payload.params } : {}),
					}
					if (message.data) {
						if (!focusManager.isFocused() || queryClient.getQueryState([queryKey, queryParams], { type: "inactive" })) {
							queryClient.setQueryData([queryKey, queryParams], message.data)
						} else if (queryClient.getQueryState([queryKey, queryParams], { type: "active" })) {
							const cache = queryClient.getQueryCache()
							const hash = hashQueryKey([queryKey, queryParams])
							const cacheUnsubscribe = cache.subscribe((event) => {
								if (event.type === "observerRemoved" || event.type === "observerAdded") {
									if (hashQueryKey(event.query.queryKey) === hash) {
										unsubscribe()
										queryClient.setQueryData([queryKey, queryParams], message.data)
									}
								} else if (event.type === "updated" || event.type === "removed") {
									if (hashQueryKey(event.query.queryKey) === hash) {
										unsubscribe()
									}
								}
							})
							const focusUnsubscribe = focusManager.subscribe(() => {
								unsubscribe()
								queryClient.setQueryData([queryKey, queryParams], message.data)
							})
							const unsubscribe = () => {
								cacheUnsubscribe()
								focusUnsubscribe()
								unsubscribeSet.delete(unsubscribe)
							}
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

	// notify service worker when app becomes online so it can retry "pending" mutations
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return
		const onOnline = async () => {
			const registration = await navigator.serviceWorker.ready
			const target = registration.active
			if (!target) return
			target.postMessage({ type: "sw-trpc-offline-post" })
		}
		addEventListener("online", onOnline)
		return () => {
			removeEventListener("online", onOnline)
		}
	}, [])

	return null
}