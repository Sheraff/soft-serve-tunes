import { useSearchParams } from 'next/navigation'
import { signIn, getProviders } from "next-auth/react"
import styles from "./index.module.css"
import SpotifyIcon from "icons/spotify.svg"
import TwitchIcon from "icons/twitch.svg"
import GithubIcon from "icons/github.svg"
import classNames from "classnames"

export const ERROR_MESSAGES = {
	// Next-Auth error types
	Configuration: "There is a problem with the server configuration. Check if your options are correct.",
	AccessDenied: "Usually occurs, when you restricted access through the signIn callback, or redirect callback",
	Verification: "Related to the Email provider. The token has expired or has already been used",

	// Sign-in error types
	OAuthSignin: "Error in constructing an authorization URL (1, 2, 3),",
	OAuthCallback: "Error in handling the response (1, 2, 3) from an OAuth provider.",
	OAuthCreateAccount: "Could not create OAuth provider user in the database.",
	EmailCreateAccount: "Could not create email provider user in the database.",
	Callback: "Error in the OAuth callback handler route",
	OAuthAccountNotLinked: "If the email on the account is already linked, but not with this OAuth account",
	EmailSignin: "Sending the e-mail with the verification token failed",
	CredentialsSignin: "The authorize callback returned null in the Credentials provider. We don't recommend providing information about which part of the credentials were wrong, as it might be abused by malicious hackers.",
	SessionRequired: "The content of this page requires you to be signed in at all times. See useSession for configuration.",

	// Fallback error types
	Default: "Catch all, will apply, if none of the above matched",
}

const Icons = {
	spotify: SpotifyIcon,
	twitch: TwitchIcon,
	github: GithubIcon,
} as const

export default function SignIn ({
	providers,
	error,
}: {
	providers: Exclude<Awaited<ReturnType<typeof getProviders>>, null>
	error?: keyof typeof ERROR_MESSAGES | null
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
				)
			})}
			{error && (
				<div className={styles.error}>
					{ERROR_MESSAGES[error]} (error code: {error})
				</div>
			)}
			<div className={styles.credits}>
				<a href="https://github.com/Sheraff/soft-serve-tunes"><GithubIcon />source</a>
			</div>
		</div>
	)
}