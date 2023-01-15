import { signIn, getProviders } from "next-auth/react"
import styles from "./index.module.css"
import SpotifyIcon from "icons/spotify.svg"
import TwitchIcon from "icons/twitch.svg"
import GithubIcon from "icons/github.svg"
import classNames from "classnames"

const Icons = {
	spotify: SpotifyIcon,
	twitch: TwitchIcon,
	github: GithubIcon,
} as const

export default function SignIn({
	providers,
}: {
	providers: Exclude<Awaited<ReturnType<typeof getProviders>>, null>
}) {
	return (
		<div className={styles.main}>
			{Object.values(providers).map((provider) => {
				const id = provider.id as keyof typeof Icons
				const Icon = Icons[id]
				return (
				<button
					type="button"
					key={provider.name}
					className={classNames(styles.item, styles[id])}
					onClick={() => signIn(provider.id)}
				>
					<Icon />
					Sign in with {provider.name}
				</button>
			)})}
			<div className={styles.credits}>
				<a href="https://github.com/Sheraff/soft-serve-tunes"><GithubIcon />source</a>
			</div>
		</div>
	)
}