/// <reference lib="webworker" />

import defaultFetch from "./default"
import mediaFetch from "./media"
import trpcFetch from "./trpc"

export default function onFetch(event: FetchEvent) {
	const request = event.request
	if (request.method !== "GET") { // ignore POST requests
		return
	}
	const url = new URL(request.url)
	if (request.headers.get('Accept')?.includes('image') && url.pathname !== '/') { // ignore requests for images
		return
	} else if (url.pathname.startsWith('/api/auth')) { // ignore requests related to auth
		return
	}
	
	if (url.pathname.startsWith('/api/trpc')) {
		trpcFetch(event, request, url)
	} else if (url.pathname.startsWith('/api/file')) {
		mediaFetch(event, request)
	} else {
		defaultFetch(event, request)
	}
}