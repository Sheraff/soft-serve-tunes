import type { NextPage } from "next"
import type { NextApiRequest, NextApiResponse } from "next"
import Head from "next/head"
import { useSession, getProviders } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { unstable_getServerSession as getServerSession } from "next-auth"
import { Suspense, useEffect, useState } from "react"
import AudioTest from "components/AudioTest"
import { ProgressBarSingleton, useProgressBar } from "components/ProgressBar"
import WatcherSocket from "components/WatcherSocket"
import { env } from "env/client.mjs"
import { trpc } from "utils/trpc"
import SignIn from "components/SignIn"
import { AppState } from "components/AppContext"
import { loadingStatus } from "server/router/list"
import asyncPersistedAtom from "client/db/asyncPersistedAtom"
import { useAtom } from "jotai"
import useIsOnline from "client/sw/useIsOnline"

const allowOfflineLogin = asyncPersistedAtom<boolean>("allowOfflineLogin", false)

const Home: NextPage<{
	providers: Awaited<ReturnType<typeof getProviders>>
	ssrLoggedIn: boolean
	shouldAwaitServer: boolean
}> = ({
	providers,
	ssrLoggedIn,
	shouldAwaitServer,
}) => {
	const setProgress = useProgressBar()
	const [ready, setReady] = useState(!shouldAwaitServer)
	const { mutate } = trpc.useMutation(["list.populate"])

	useEffect(() => {
		if (ready) return
		const controller = new AbortController()
		let socket: WebSocket | null = null
		mutate(undefined, {
			onSuccess(shouldSubscribe) {
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
			},
			onError() {
				setReady(true)
			}
		})
		return () => {
			controller.abort()
			socket?.close()
		}
	}, [mutate, setProgress, ready])

	const { data: session } = useSession()

	const onlineLoggedInState = Boolean(ssrLoggedIn || session || !providers)
	const [offlineLoggedInState, setOfflineLoggedIn] = useAtom(allowOfflineLogin)
	const isOnline = useIsOnline()
	useEffect(() => {
		if (isOnline) {
			setOfflineLoggedIn(onlineLoggedInState)
		}
	}, [onlineLoggedInState, isOnline, setOfflineLoggedIn])

	const loggedIn = isOnline ? onlineLoggedInState : offlineLoggedInState

	return (
		<>
			<Head>
				<title>Soft Serve Tunes</title>
				<meta name="description" content="self hosted music streaming" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<ProgressBarSingleton />
			<AppState>
				{ready && loggedIn && (
					<>
						<Suspense>
							<AudioTest />
						</Suspense>
						<WatcherSocket />
					</>
				)}
			</AppState>
			{!loggedIn && isOnline && (
				<SignIn providers={providers!} />
			)}
			<div id="modal" />
		</>
	)
}

export async function getServerSideProps({
	req,
	res,
}: {
	req: NextApiRequest
	res: NextApiResponse
}) {
	const providers = await getProviders()
	const session = await getServerSession(req, res, nextAuthOptions);
	const shouldAwaitServer = !loadingStatus.populated
	return {
		props: {
			providers,
			ssrLoggedIn: Boolean(session),
			shouldAwaitServer,
		},
	}
}

export default Home
