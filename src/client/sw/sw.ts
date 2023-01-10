/// <reference lib="webworker" />
import { CACHES } from "./utils/constants"
import onFetch from "./fetch"
import onMessage from "./messages"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

self.addEventListener("install", (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHES.next)
		await cache.add("/")
		await self.skipWaiting()

		console.log("SW: installed")
	})())
})

self.addEventListener("activate", (event) => {
	event.waitUntil((async () => {
		// remove caches that aren't used anymore
		const cacheNames = await caches.keys()
		const appCaches = Object.values(CACHES)
		await Promise.allSettled(
			cacheNames
				.filter((cacheName) => !appCaches.includes(cacheName))
				.map(cacheName => caches.delete(cacheName))
		)

		// immediately claim clients to avoid de-sync
		await self.clients.claim()

		console.log("SW: active")
	})())
})

self.addEventListener("fetch", onFetch)
self.addEventListener("message", onMessage)