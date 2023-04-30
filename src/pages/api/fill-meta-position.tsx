import { NextApiRequest, NextApiResponse } from "next"
import getServerAuth from "server/common/server-auth"
import { prisma } from "server/db/client"

async function modify (id: string) {
	const data = await prisma.track.findUnique({
		where: { id },
		select: {
			file: {
				select: {
					path: true,
				}
			},
			position: true,
			metaPosition: true,
			spotify: { select: { trackNumber: true } },
			audiodb: { select: { intTrackNumber: true } },
		}
	})
	if (!data) {
		console.log(`track ${id} not found`)
		return
	}
	if (!data.file) {
		console.log(`track ${id} has no file`)
		return
	}
	if (data.metaPosition !== null) {
		console.log(`track ${id} already has a metaPosition`)
		return
	}
	await prisma.track.update({
		where: { id },
		data: {
			metaPosition: data.position,
			position: data.position ?? data.spotify?.trackNumber ?? data.audiodb?.intTrackNumber ?? null
		}
	})
}

async function act () {
	const chunkSize = 20
	let cursor = 0
	let tracks: { id: string }[]
	do {
		console.log(`computing ${chunkSize} track meta-position from #${cursor}`)
		tracks = await prisma.track.findMany({
			skip: cursor,
			take: chunkSize,
			select: { id: true },
		})
		cursor += chunkSize
		for (const track of tracks) {
			await modify(track.id)
		}
	} while (tracks.length === chunkSize)
	console.log("DONE --------------------------------")
}

export default async function cover (req: NextApiRequest, res: NextApiResponse) {
	if (!await getServerAuth(req, res)) {
		return
	}
	act()
	return res.status(200).end()
}