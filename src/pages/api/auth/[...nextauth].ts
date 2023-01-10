import NextAuth, { type NextAuthOptions } from "next-auth"
import SpotifyProvider from "next-auth/providers/spotify"
import TwitchProvider from "next-auth/providers/twitch"
import GithubProvider from "next-auth/providers/github"

// Prisma adapter for NextAuth, optional and can be removed
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "server/db/client"
import { env } from "env/server.mjs"
import log from "utils/logger"

export const authOptions: NextAuthOptions = {
	// Include user.id on session
	callbacks: {
		async signIn({user, account}) {
			const allowed = env.ALLOWED_USERS.some(
				([provider, email]) => account && account.provider === provider && user.email === email
			)
			if (!allowed) {
				log("error", "401", `Unauthorized sign-in attempt @ ${account?.provider} - ${user.email}`)
				console.log(account)
				console.log(user)
			}
			return allowed
		},
		session({ session, user }) {
			if (session.user) {
				session.user.id = user.id
			}
			return session
		},
	},
	// Configure one or more authentication providers
	adapter: PrismaAdapter(prisma),
	providers: [
		SpotifyProvider({
			clientId: env.SPOTIFY_CLIENT_ID,
			clientSecret: env.SPOTIFY_CLIENT_SECRET,
		}),
		TwitchProvider({
			clientId: env.TWITCH_CLIENT_ID,
			clientSecret: env.TWITCH_CLIENT_SECRET,
		}),
		GithubProvider({
			clientId: env.GITHUB_CLIENT_ID,
			clientSecret: env.GITHUB_CLIENT_SECRET,
		})
	],
}

export default NextAuth(authOptions)
