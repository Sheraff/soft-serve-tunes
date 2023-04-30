import { localClient } from "client/sw/network/localClient"

export default async function swFetch (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	if (!localClient.host) {
		return fetch(input, init)
	}

	console.log("swFetch")

	if (typeof input === "string") {
		input = new URL(input)
	}

	if (input instanceof URL) {
		console.log("url", input.host, location.host, localClient.host)
		if (input.host === location.host) {
			input.host = localClient.host
		}
		input.searchParams.set("registrationId", localClient.registrationId)
	}

	if (input instanceof Request) {
		const url = new URL(input.url)
		if (url.host === location.host) {
			url.host = localClient.host
		}
		url.searchParams.set("registrationId", localClient.registrationId)
		console.log("request", input.url, location.host, localClient.host)
		if (url.pathname === "/api/upload") {
			input = new Request(url, { ...input, duplex: 'half' })
		} else {
			input = new Request(url, input)
		}

	}

	return fetch(input, init)
}