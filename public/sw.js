self.addEventListener('install', () => {
	console.log('Hello from the Service Worker 🤙')
})

const STATIC_OFFLINE_PAGE = `
<body>
	<p>This content is served while you are offline
	<p><button onclick="window.location.reload()">reload page</button>
</body>
`

/** @param {Event} event */
function onFetch(event) {
	/** @type {Request} */
	const request = event.request
	if (request.method !== "GET") return
	event.respondWith(
		fetch(event.request)
		.then(response => {
			if (response.status === 200) {
				const cacheResponse = response.clone()
				caches.open("soft-serve-tunes").then(cache => {
					cache.put(request, cacheResponse)
				})
			}
			return response
		})
		.catch(error => {
			console.error(error)
			return caches.match(event.request)
		})
		.catch(() => {
			return new Response(STATIC_OFFLINE_PAGE, {
				status: 200,
				headers: {
					'Content-Type': 'text/html; charset=utf-8'
				}
			})
		})
	);
}

self.addEventListener('fetch', onFetch)

// function onOnline() {
// 	console.log('SW online')
// 	self.removeEventListener('fetch', onFetch)
// 	self.removeEventListener('online', onOnline)
// 	self.addEventListener('offline', onOffline)
// }

// function onOffline() {
// 	console.log('SW offline')
// 	self.addEventListener('fetch', onFetch)
// 	self.addEventListener('online', onOnline)
// 	self.removeEventListener('offline', onOffline)
// }

// if (navigator.onLine) {
// 	onOnline()
// } else {
// 	onOffline()
// }