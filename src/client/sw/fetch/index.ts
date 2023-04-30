/// <reference lib="webworker" />

import { localClient } from "client/sw/network/localClient"
import defaultFetch from "./default"
import mediaFetch from "./media"
import trpcFetch from "./trpc"
import trpcPost from "./trpcPost"
import swFetch from "client/sw/network/swFetch"

export default function onFetch (event: FetchEvent) {
	const request = event.request

	conditions: {
		if (request.headers.get("cache") === "no-store") {
			break conditions
		}

		if (request.method === "GET") {
			const url = new URL(request.url)
			if (url.pathname.startsWith("/api/cover") || (request.headers.get("Accept")?.includes("image") && url.pathname !== "/")) { // ignore requests for images
				break conditions
			} else if (url.pathname.startsWith("/api/auth")) { // ignore requests related to auth
				return
			}

			if (url.pathname.startsWith("/api/trpc")) {
				trpcFetch(event, request, url)
			} else if (url.pathname.startsWith("/api/file")) {
				mediaFetch(event, request)
			} else {
				defaultFetch(event, request)
			}
			return
		}

		if (request.method === "POST") {
			const url = new URL(request.url)
			if (url.pathname.startsWith("/api/trpc")) {
				trpcPost(event, request)
				return
			}
		}
	}

	if (localClient.host) {
		return event.respondWith(swFetch(request))
	}
}