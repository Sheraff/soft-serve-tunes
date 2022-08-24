import type { NextPage } from "next"
import Head from "next/head"
import { useSession, getProviders } from "next-auth/react"
import { useEffect, useState } from "react"
import AudioTest from "components/AudioTest"
import DropTarget from "components/DropTarget"
import { ProgressBarSingleton, useProgressBar } from "components/ProgressBar"
import { AppState } from "components/AppContext"
import WatcherSocket from "components/WatcherSocket"
import { env } from "env/client.mjs"
import { trpc } from "utils/trpc"
import SignIn from "components/SignIn"

const Home: NextPage<{
	providers: Awaited<ReturnType<typeof getProviders>>
}> = ({
	providers,
}) => {
	const setProgress = useProgressBar()
	const [ready, setReady] = useState(false)
	const { mutate } = trpc.useMutation(["list.populate"])

	useEffect(() => {
		const controller = new AbortController()
		let socket: WebSocket | null = null
		mutate(undefined, {
			onSuccess: (shouldSubscribe) => {
				if (!shouldSubscribe) {
					setProgress(1)
					setReady(true)
					return
				}
				socket = new WebSocket(env.NEXT_PUBLIC_WEBSOCKET_URL)
				socket.onopen = () => {
					socket?.send(JSON.stringify({ type: 'populate:subscribe' }))
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
				}, { signal: controller.signal })
			}
		})
		return () => {
			controller.abort()
			socket?.close()
		}
	}, [mutate, setProgress])

	const { data: session } = useSession()

	return (
		<>
			<Head>
				<title>Soft Serve Tunes</title>
				<meta name="description" content="self hosted music streaming" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<AppState>
				<ProgressBarSingleton />
				{ready && (session || !providers) && (
					<>
						{console.log(session)}
						<AudioTest />
						<WatcherSocket />
						<DropTarget />
					</>
				)}
				{!session && providers && (
					<SignIn providers={providers} />
				)}
			</AppState>
		</>
	)
}

export async function getServerSideProps() {
	const providers = await getProviders()
	return {
		props: { providers },
	}
}

export default Home
