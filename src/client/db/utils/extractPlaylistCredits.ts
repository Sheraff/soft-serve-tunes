export default function extractPlaylistCredits<
	Al extends {id: string},
	Ar extends {id: string, name: string}
>(
	tracks: {
		album?: Al | null
		artist?: Ar | null
	}[]
) {
	const albumMap = new Map<string, Al>
	const artistMap = new Map<string, Ar>
	const counts = tracks.reduce((acc, {album, artist}) => {
		if (album) {
			const id = album.id
			const count = acc.albums.get(id)
			if (!count)
				acc.albums.set(id, 1)
			else
				acc.albums.set(id, count + 1)
			if (!albumMap.has(id))
				albumMap.set(id, album)
		}
		if (artist) {
			const id = artist.id
			const count = acc.artists.get(id)
			if (!count)
				acc.artists.set(id, 1)
			else
				acc.artists.set(id, count + 1)
			if (!artistMap.has(id))
				artistMap.set(id, artist)
		}
		return acc
	}, {
		albums: new Map<string, number>(),
		artists: new Map<string, number>(),
	})

	const albums = Array.from(counts.albums.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([id, _count]) => ({
			...albumMap.get(id) as Al,
			_count,
		}))

	const artists = Array.from(counts.artists.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([id, _count]) => ({
			...artistMap.get(id) as Ar,
			_count,
		}))
	
	return {albums, artists}
}