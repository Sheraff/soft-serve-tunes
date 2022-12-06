import { useSession, type getProviders } from "next-auth/react"
import { Suspense, useEffect } from "react"
import AudioTest from "components/AudioTest"
import WatcherSocket from "components/WatcherSocket"
import SignIn from "components/SignIn"
import { AppState } from "components/AppContext"
import suspensePersistedState from "client/db/suspensePersistedState"
import useIsOnline from "client/sw/useIsOnline"

const allowOfflineLogin = suspensePersistedState<boolean>("allowOfflineLogin", false)

export default function AuthCore({
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
	const [offlineLoggedInState, setOfflineLoggedIn] = allowOfflineLogin.useState()
	const isOnline = useIsOnline()
	useEffect(() => {
		if (isOnline) {
			setOfflineLoggedIn(onlineLoggedInState)
		}
	}, [onlineLoggedInState, isOnline, setOfflineLoggedIn])

	const loggedIn = isOnline ? onlineLoggedInState : offlineLoggedInState

	return (
		<>
			{ready && loggedIn && (
				<>
					<AppState />
					<Suspense>
						<AudioTest />
					</Suspense>
					<WatcherSocket />
				</>
			)}
			{!loggedIn && isOnline && (
				<SignIn providers={providers!} />
			)}
		</>
	)
}