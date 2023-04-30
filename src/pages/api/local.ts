import type { NextApiRequest, NextApiResponse } from "next"
import csrfAuth from "server/csrfAuth"

export default async function local (req: NextApiRequest, res: NextApiResponse) {
	res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000')
	res.setHeader('Access-Control-Allow-Credentials', 'true')
	console.log("from /local", req.query.token)
	const isAuthed = csrfAuth(req.query.token, res)
	console.log("isAuthed", isAuthed)
	console.log("got ping")
	console.log(req.url)
	console.log(req.cookies)
	res.status(200).json({ message: "yes" })
}