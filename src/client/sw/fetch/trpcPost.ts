/// <reference lib="webworker" />

const requests: Request[] = []

let processing = false
export async function retryPostOnOnline() {
	if (processing) return
	processing = true
	while (requests[0]) {
		try {
			await fetch(requests[0])
			requests.shift()
		} catch (e) {
			console.warn(new Error("SW: error with delayed POST request", {cause: e}))
			processing = false
			return
		}
	}
	processing = false
}

export default function trpcPost(event: FetchEvent, request: Request) {
	const clone = request.clone()
	event.respondWith(
		fetch(request)
		.catch(() => {
			requests.push(clone)
			return new Response("", {status: 503, statusText: "Service unavailable, retrying later"})
		})
	)
}