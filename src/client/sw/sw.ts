/// <reference lib="webworker" />
import { CACHES } from "./constants"
import onFetch from "./fetch"
import onMessage from "./messages"
declare var self: ServiceWorkerGlobalScope // eslint-disable-line no-var

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHES.next)
		.then((cache) => cache.add('/'))
		.then(() => self.skipWaiting())
	)
	console.log('Hello from the Service Worker 🤙')
})

self.addEventListener('fetch', onFetch)
self.addEventListener("message", onMessage)