import { signIn, getProviders } from "next-auth/react"
import styles from "./index.module.css"
import SpotifyIcon from "icons/spotify.svg"
import TwitchIcon from "icons/twitch.svg"
import classNames from "classnames"

const Icons = {
	spotify: SpotifyIcon,
	twitch: TwitchIcon,
} as const

export default function SignIn({
	providers,
}: {
	providers: Exclude<Awaited<ReturnType<typeof getProviders>>, null>
}) {
	return (
		<div className={styles.main}>
			{Object.values(providers).map((provider) => {
				const Icon = Icons[provider.id as keyof typeof Icons]
				return (
				<button
					type="button"
					key={provider.name}
					className={classNames(styles.item, styles[provider.id])}
					onClick={() => signIn(provider.id)}
				>
					<Icon />
					Sign in with {provider.name}
				</button>
			)})}
		</div>
	)
}