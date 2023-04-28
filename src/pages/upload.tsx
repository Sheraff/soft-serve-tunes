import type { NextApiRequest, NextApiResponse } from "next"
import { getProviders, useSession } from "next-auth/react"
import { authOptions as nextAuthOptions } from "pages/api/auth/[...nextauth]"
import { getServerSession } from "next-auth"
import { ProgressBarSingleton } from "components/ProgressBar"
import { Suspense } from "react"
import SignIn from "components/SignIn"
import DropTarget from "components/Header/Upload/DropTarget"
import WatcherSocket from "components/WatcherSocket"


export default function Upload ({
	providers,
	ssrLoggedIn,
}: {
	providers: Awaited<ReturnType<typeof getProviders>>
	ssrLoggedIn: boolean
}) {
	const { data: session } = useSession()

	const onlineLoggedInState = Boolean(ssrLoggedIn || session || !providers)

	return (
		<>
			<ProgressBarSingleton />
			{onlineLoggedInState && (
				<Suspense>
					<DropTarget />
					<WatcherSocket />
				</Suspense>
			)}
			{!onlineLoggedInState && (
				<SignIn providers={providers!} />
			)}
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
	return {
		props: {
			providers,
			ssrLoggedIn: Boolean(session),
		},
	}
}
