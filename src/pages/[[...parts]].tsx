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
import SignIn from "components/SignIn"
import { AppState } from "components/AppContext"
import asyncPersistedAtom from "client/db/asyncPersistedAtom"
import { useAtom } from "jotai"
import useIsOnline from "client/sw/useIsOnline"
import { socketClient } from "utils/typedWs/react-client"
import { useQuery } from "@tanstack/react-query"
import { loadingStatus } from "pages/api/cold-start"

const allowOfflineLogin = asyncPersistedAtom<boolean>("allowOfflineLogin", false)

function AuthCore({
	providers,
	ssrLoggedIn,
	ready,
}: {
	providers: Awaited<ReturnType<typeof getProviders>>
	ssrLoggedIn: boolean
	ready: boolean
}) {
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
		</>
	)
}

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

	const {data: coldStartLoading} = useQuery(["cold-start"], {
		queryFn: () => fetch("/api/cold-start", {headers: {Cache: "no-store"}})
			.then((res) => res.json())
			.then((json) => !json.done)
			.catch(() => false),
	})
	socketClient.loading.useSubscription({
		onData(progress) {
			setProgress(progress)
			if (progress === 1) {
				setReady(true)
			}
		},
		onError(error) {
			console.error(error)
			setProgress(1)
			setReady(true)
		},
		enabled: coldStartLoading !== false
	})

	return (
		<>
			<Head>
				<title>Soft Serve Tunes</title>
				<meta name="description" content="self hosted music streaming" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<ProgressBarSingleton />
			<Suspense>
				<AuthCore
					providers={providers}
					ssrLoggedIn={ssrLoggedIn}
					ready={ready || coldStartLoading === false}
				/>
			</Suspense>
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
