import type { NextApiRequest, NextApiResponse } from "next"
export default async function local (req: NextApiRequest, res: NextApiResponse) {
	try {
		const data = JSON.parse(req.body)
		console.log("got ping")
		console.log(data)
		if (data.message === "are you there?") {
			res.status(200).json({ message: "yes" })
		}
	} catch (error) {
		console.log("got ping but error parsing body")
		console.log(error)
	}
}