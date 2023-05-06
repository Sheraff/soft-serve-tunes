import type { NextApiRequest, NextApiResponse } from "next"
import { getProviders } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { getServerSession } from "next-auth"
import { Suspense, startTransition, useState } from "react"
import { ProgressBarSingleton, useProgressBar } from "components/ProgressBar"
import { socketClient } from "utils/typedWs/react-client"
import { useQuery } from "@tanstack/react-query"
import { loadingStatus } from "pages/api/cold-start"
import dynamic from "next/dynamic"

const AuthCore = dynamic(() => import("components/Client"), { ssr: false })


export default function Home ({
	providers,
	ssrLoggedIn,
	shouldAwaitServer,
}: {
	providers: Awaited<ReturnType<typeof getProviders>>
	ssrLoggedIn: boolean
	shouldAwaitServer: boolean
}) {
	const setProgress = useProgressBar()
	const [ready, setReady] = useState(!shouldAwaitServer)

	const { data: coldStartLoading } = useQuery(["cold-start"], {
		queryFn: () => fetch("/api/cold-start", { headers: { Cache: "no-store" } })
			.then((res) => res.status === 202)
			.catch(() => false),
		enabled: !ready
	})
	socketClient.loading.useSubscription({
		onData (progress) {
			startTransition(() => {
				setProgress(progress)
				if (progress === 1) {
					setReady(true)
				}
			})
		},
		onError (error) {
			console.error("socketClient loading subscription error")
			console.error(error)
			startTransition(() => {
				setProgress(1)
				setReady(true)
			})
		},
		enabled: coldStartLoading === true
	})

	return (
		<>
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

export async function getServerSideProps ({
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
