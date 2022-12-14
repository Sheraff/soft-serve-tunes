import type { NextPage } from "next"
import type { NextApiRequest, NextApiResponse } from "next"
import Head from "next/head"
import { getProviders } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { unstable_getServerSession as getServerSession } from "next-auth"
import { Suspense, useState } from "react"
import { ProgressBarSingleton, useProgressBar } from "components/ProgressBar"
import { socketClient } from "utils/typedWs/react-client"
import { useQuery } from "@tanstack/react-query"
import { loadingStatus } from "pages/api/cold-start"
import dynamic from "next/dynamic"

const AuthCore = dynamic(() => import("components/Client"), { ssr: false })


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
		enabled: coldStartLoading === true
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
	const session = await getServerSession(req, res, nextAuthOptions)
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
