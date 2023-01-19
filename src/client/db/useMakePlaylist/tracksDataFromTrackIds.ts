import { type trpc } from "utils/trpc"

export default async function tracksDataFromTrackIds(
	ids: string[],
	trpcClient: ReturnType<typeof trpc.useContext>
) {
	const tracks = await Promise.all(ids.map(async (id) => {
		const existing = trpcClient.track.miniature.getData({id})
		if (existing) {
			return {
				id,
				name: existing.name,
				artist: existing.artist,
				album: existing.album,
			}
		}
		const data = await trpcClient.track.miniature.fetch({id})
		if (data) {
			return {
				id,
				name: data.name,
				artist: data.artist,
				album: data.album,
			}
		}
		return null
	}))
	
	return tracks.filter(Boolean) as NonNullable<typeof tracks[number]>[]
}