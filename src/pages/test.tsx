import type { NextApiRequest, NextApiResponse } from "next"
import { getProviders, useSession } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { getServerSession } from "next-auth"
import { ProgressBarSingleton } from "components/ProgressBar"
import { Suspense, use, useEffect, useRef } from "react"
import SignIn from "components/SignIn"
import DropTarget from "components/Header/Upload/DropTarget"
import WatcherSocket from "components/WatcherSocket"
import { trpc } from "utils/trpc"


export default function Upload () {

	const client = trpc.useContext()

	const running = useRef(false)
	useEffect(() => {
		if (running.current) return
		running.current = true
		async function main () {

			const COUNT = 100
			const LIST = [
				["artist", "mostFav"],
				["artist", "mostRecentListen"],
				["artist", "leastRecentListen"],
				["album", "mostFav"],
				["album", "mostRecentListen"],
				["album", "mostRecentAdd"],
				["genre", "mostFav"],
				["playlist", "searchable"],
			] as const

			await new Promise(r => setTimeout(r, 4_000))

			for (const [namespace, procedure] of LIST) {
				await client[namespace][procedure].prefetch()
				await new Promise(r => setTimeout(r, 1_000))
				const a = performance.now()
				for (let i = 0; i < COUNT; i++) {
					await client[namespace][procedure].refetch()
				}
				const b = performance.now()
				console.log(`${namespace}.${procedure}: ${(b - a) / COUNT}ms per call`)
			}

			const a = performance.now()
			for (let i = 0; i < COUNT; i++) {
				await Promise.all(LIST.map(([namespace, procedure]) => client[namespace][procedure].refetch()))
			}
			const b = performance.now()
			console.log(`batch all: ${(b - a) / COUNT}ms per call`)
		}
		main()
	}, [])

	return (
		<>
			<ProgressBarSingleton />
			<p>hello</p>
			<div id="modal" />
		</>
	)
}
