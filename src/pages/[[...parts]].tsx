import classNames from "classnames"
import type { NextPage } from "next"
import Head from "next/head"
import { useEffect, useState } from "react"
import AudioTest from "../components/AudioTest"
import { RouteParser } from "../components/RouteContext"
import WatcherSocket from "../components/WatcherSocket"
import { env } from "../env/client.mjs"
import { trpc } from "../utils/trpc"
import styles from "./index.module.css"


const Home: NextPage = () => {
	const [progress, setProgress] = useState(0)
	const [ready, setReady] = useState(false)
	const { mutate } = trpc.useMutation(["list.populate"])
	
	useEffect(() => {
		const controller = new AbortController()
		let socket: WebSocket | null = null
		mutate(undefined, { onSuccess: (shouldSubscribe) => {
			if (!shouldSubscribe) {
				setProgress(1)
				setReady(true)
				return
			}
			socket = new WebSocket(`ws://${window.location.hostname}:${env.NEXT_PUBLIC_WEBSOCKET_PORT}`)
			socket.onopen = () => {
				socket?.send(JSON.stringify({type: 'populate:subscribe'}))
			}
			socket.addEventListener("message", (e) => {
				const data = JSON.parse(e.data)
				if (data.type === "populate:done") {
					console.log("populating library: DONE")
					setProgress(1)
					setReady(true)
					socket?.close()
				} else if (data.type === "populate:progress") {
					console.log(`populating library: ${data.payload}%`)
					setProgress(data.payload)
				}
			}, {signal: controller.signal})
		} })
		return () => {
			controller.abort()
			socket?.close()
		}
	}, [mutate])

	return (
		<>
			<Head>
				<title>Soft Serve Tunes</title>
				<meta name="description" content="self hosted music streaming" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<RouteParser>
				<div className={classNames(styles.progress, {[styles.done]: progress === 1})} style={
					{'--progress': progress} as React.CSSProperties
				}/>
				{ready && (
					<>
						<AudioTest />
						<WatcherSocket />
					</>
				)}
			</RouteParser>
		</>
	)
}

export default Home
