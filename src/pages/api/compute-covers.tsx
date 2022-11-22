import { NextApiRequest, NextApiResponse } from "next"
import { prisma } from "server/db/client"
import { computeAlbumCover, computeArtistCover, computeTrackCover } from "server/db/computeCover"

async function computeCoversByTrackEntrypoint(id: string) {
	await computeTrackCover(id, {tracks: true, artist: true, album: true})
}

async function act() {
	const chunkSize = 20
	let cursor = 0
	let tracks: {id: string}[]
	do {
		console.log(`computing ${chunkSize} track covers from #${cursor}`)
		tracks = await prisma.track.findMany({
			select: {id: true},
			skip: cursor,
			take: chunkSize,
		})
		cursor += chunkSize
		for (const track of tracks) {
			await computeCoversByTrackEntrypoint(track.id)
		}
	} while (tracks.length === chunkSize)
	console.log('DONE --------------------------------')
}

export default async function cover(req: NextApiRequest, res: NextApiResponse) {
	act()
	return res.status(200).end()
}