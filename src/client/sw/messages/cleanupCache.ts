/// <reference lib="webworker" />
import { type BuildProcedure } from "@trpc/server"
import { type AppRouter, type RouteKey } from "utils/trpc"
import { CACHES } from "../utils/constants"
import swFetch from "client/sw/network/swFetch"

export const listOfAllGetRoutes: {
	readonly [K in RouteKey]: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic must match *any* type
		[L in keyof AppRouter["_def"]["procedures"][K]["_def"]["procedures"]]: AppRouter["_def"]["procedures"][K]["_def"]["procedures"][L] extends BuildProcedure<"query", any, any>
		? true
		: undefined
	}
} = {
	playlist: {
		generate: true,
		get: true,
		searchable: true,
		delete: undefined,
		modify: undefined,
		more: undefined,
		save: undefined,
	},
	artist: {
		get: true,
		leastRecentListen: true,
		miniature: true,
		searchable: true,
		mostFav: true,
		mostRecentAdd: true,
		mostRecentListen: true
	},
	track: {
		searchable: true,
		miniature: true,
		playcount: undefined,
		like: undefined,
		byMultiTraits: true,
	},
	album: {
		searchable: true,
		miniature: true,
		get: true,
		mostFav: true,
		mostRecentListen: true,
		mostRecentAdd: true,
		byMultiTraits: true,
	},
	genre: {
		miniature: true,
		get: true,
		searchable: true,
		mostFav: true,
	},
	cover: {
		byId: true,
		fromAlbums: true,
		fromTracks: true,
	},
	edit: {
		track: undefined,
		album: undefined,
		artist: undefined,
		genre: undefined,
	},
}


let cleanupActive = false

export function cleanupCache () {
	cleanupActive = true
	cleanupTrpcCache()
	cleanupNextCache()
	cleanupMediaCache()
}

export function pauseCacheCleanup () {
	cleanupActive = false
}

async function cleanupTrpcCache () {
	const endpoints = new Set<string>()
	for (const scope in listOfAllGetRoutes) {
		const obj = listOfAllGetRoutes[scope as keyof typeof listOfAllGetRoutes]
		for (const endpoint in obj) {
			if (obj[endpoint as keyof typeof obj]) endpoints.add(`${scope}.${endpoint}`)
		}
	}
	const cache = await caches.open(CACHES.trpc)
	if (!cleanupActive) return

	const keys = await cache.keys()
	if (!cleanupActive) return

	const startIndex = random(0, keys.length - 1)
	const max = Math.min(keys.length, 200)
	for (let i = 0; i < max; i++) {
		await sleep(100)
		if (!cleanupActive) return

		const index = (startIndex + i) % keys.length
		const key = keys[index]!

		const url = new URL(key.url)
		const endpoint = url.pathname.split("/").at(-1)!
		if (!endpoints.has(endpoint)) {
			await cache.delete(key)
			if (!cleanupActive) return
			continue
		}

		const data = await cache.match(key)
		if (!cleanupActive) return
		if (!data) continue

		const trpcResponse = await data.json()
		if (!cleanupActive) return

		const content = trpcResponse.result?.data?.json
		if (content) continue

		await cache.delete(key)
		if (!cleanupActive) return
	}
}

async function cleanupNextCache () {
	const cache = await caches.open(CACHES.next)
	if (!cleanupActive) return

	const keys = await cache.keys()
	if (!cleanupActive) return

	const startIndex = random(0, keys.length - 1)
	const max = Math.min(keys.length, 10)
	for (let i = 0; i < max; i++) {
		await sleep(498)
		if (!cleanupActive) return

		const index = (startIndex + i) % keys.length
		const key = keys[index]!

		try {
			const ping = await swFetch(key.url, { method: "HEAD" })
			if (!cleanupActive) return
			if (ping.status !== 404) continue
			await cache.delete(key)
		} catch { }
		if (!cleanupActive) return
	}
}

async function cleanupMediaCache () {
	const cache = await caches.open(CACHES.media)
	if (!cleanupActive) return

	const keys = await cache.keys()
	if (!cleanupActive) return

	const startIndex = random(0, keys.length - 1)
	const max = Math.min(keys.length, 100)
	for (let i = 0; i < max; i++) {
		await sleep(180)
		if (!cleanupActive) return

		const index = (startIndex + i) % keys.length
		const key = keys[index]!

		const data = await cache.match(key)
		if (!cleanupActive) return
		if (!data) continue

		const length = data.headers.get("content-length")
		if (length) continue

		await cache.delete(key)
		if (!cleanupActive) return
	}
}

function sleep (ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function random (min: number, max: number) {
	return Math.floor(Math.random() * (max - min + 1) + min)
}