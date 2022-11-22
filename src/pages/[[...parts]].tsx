import type { NextPage } from "next"
import type { NextApiRequest, NextApiResponse } from "next"
import Head from "next/head"
import { useSession, getProviders } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { unstable_getServerSession as getServerSession } from "next-auth"
import { useEffect, useState } from "react"
import AudioTest from "components/AudioTest"
import { ProgressBarSingleton, useProgressBar } from "components/ProgressBar"
import WatcherSocket from "components/WatcherSocket"
import { trpc } from "utils/trpc"
import SignIn from "components/SignIn"
import { AppState } from "components/AppContext"
import { loadingStatus } from "server/router/list"
import asyncPersistedAtom from "components/AppContext/asyncPersistedAtom"
import { useAtom } from "jotai"
import useIsOnline from "client/sw/useIsOnline"
import Socket from "client/ws/socket"

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
		let socket: Socket | null = null
		mutate(undefined, {
			onSuccess(shouldSubscribe) {
				if (!shouldSubscribe) {
					setProgress(1)
					setReady(true)
					return
				}
				socket = new Socket()
				socket.send(JSON.stringify({ type: 'populate:subscribe' }))
				socket.addEventListener("populate:done", () => {
					console.log("populating library: DONE")
					setProgress(1)
					setReady(true)
					socket?.close()
					socket = null
				}, { signal: controller.signal })
				socket.addEventListener("populate:progress", ({detail}) => {
					console.log(`populating library: ${detail}%`)
					setProgress(detail)
				}, { signal: controller.signal })
			},
			onError() {
				setReady(true)
			}
		})
		return () => {
			controller.abort()
			socket?.close()
			socket = null
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
						<AudioTest />
						<WatcherSocket />
					</>
				)}
			</AppState>
			{!loggedIn && (
				<SignIn providers={providers} />
			)}
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
