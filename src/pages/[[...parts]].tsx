import type { NextPage } from "next"
import Head from "next/head"
import { useEffect, useState } from "react"
import { useQueryClient } from "react-query"
import AudioTest from "../components/AudioTest"
import { RouteParser } from "../components/RouteContext"
import { trpc } from "../utils/trpc"
import styles from "./index.module.css"


const Home: NextPage = () => {
	const [progress, setProgress] = useState(0)
	const [ready, setReady] = useState(false)
	const { mutate } = trpc.useMutation(["list.populate"])
	const client = useQueryClient()
	useEffect(() => {
		mutate(undefined, {onSuccess: () => {
			const ws = new WebSocket(`ws://${window.location.hostname}:${process.env.NEXT_PUBLIC_WEBSOCKET_PORT}/api/list/populate`)
			performance.mark("lib-pop-start")
			ws.onmessage = (e) => {
				const data = JSON.parse(e.data)
				if (data.type === "done") {
					console.log("populating library: DONE")
					performance.mark("lib-pop-end")
					performance.measure("lib-pop", "lib-pop-start", "lib-pop-end")
					client.invalidateQueries(["list.all"])
					console.log(performance.getEntriesByName("lib-pop").at(-1)?.duration)
					setProgress(1)
					setReady(true)
				} else if (data.type === "progress") {
					console.log(`populating library: ${data.payload}%`)
					setProgress(data.payload)
				}
			}
		}})
	}, [mutate, client])

	return (
		<>
			<Head>
				<title>Soft Serve Tunes</title>
				<meta name="description" content="self hosted music streaming" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<RouteParser>
				<div className={styles.progress} style={
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
