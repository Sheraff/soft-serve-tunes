import classNames from "classnames"
import type { NextPage } from "next"
import Head from "next/head"
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "react-query"
import AudioTest from "../components/AudioTest"
import { RouteParser } from "../components/RouteContext"
import { trpc } from "../utils/trpc"
import styles from "./index.module.css"


const Home: NextPage = () => {
	const [progress, setProgress] = useState(0)
	const [ready, setReady] = useState(false)
	const { mutate } = trpc.useMutation(["list.populate"])
	
	const ws = useRef<WebSocket>()
	useEffect(() => {
		if (!ws.current) {
			ws.current = new WebSocket(`ws://${window.location.hostname}:${process.env.NEXT_PUBLIC_WEBSOCKET_PORT}`)
		}
		const controller = new AbortController()
		const socket = ws.current
		socket.addEventListener("message", (e) => {
			const data = JSON.parse(e.data)
			if (data.type === "done") {
				console.log("populating library: DONE")
				setProgress(1)
				setReady(true)
				socket.close()
				ws.current = undefined
			} else if (data.type === "progress") {
				console.log(`populating library: ${data.payload}%`)
				setProgress(data.payload)
			}
		}, {signal: controller.signal})
		mutate(undefined)
		return () => controller.abort()
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
					<AudioTest />
				)}
			</RouteParser>
		</>
	)
}

export default Home
