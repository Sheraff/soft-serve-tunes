
import { createHash } from 'crypto'
import { env } from "env/server.mjs"
import { type NextApiResponse } from 'next'

const secret = env.NEXTAUTH_SECRET

export default function csrfAuth (parsedCsrfTokenAndHash: string | undefined | string[], res: NextApiResponse): boolean {
	try {
		if (!parsedCsrfTokenAndHash) {
			res.status(403).json({ error: { status: 'missing csrf' } })
			// can't find next-auth CSRF in cookies
			return false
		}
		if (Array.isArray(parsedCsrfTokenAndHash)) {
			res.status(403).json({ error: { status: 'malformed csrf' } })
			return false
		}

		// delimiter could be either a '|' or a '%7C'
		const tokenHashDelimiter =
			parsedCsrfTokenAndHash.indexOf('|') !== -1 ? '|' : '%7C'

		const [requestToken, requestHash] = parsedCsrfTokenAndHash.split(
			tokenHashDelimiter
		)

		// compute the valid hash
		const validHash = getCsrfHash(requestToken!)
		if (!validHash || requestHash !== validHash) {
			res.status(403).json({ error: { status: 'bad hash' } })
			return false
		}
	} catch (err) {
		res.status(500).end()
		return false
	}
	return true
}

export function getCsrfHash (token: string | undefined) {
	if (!token) return ""
	return createHash('sha256')
		.update(`${token}${secret}`)
		.digest('hex')
}