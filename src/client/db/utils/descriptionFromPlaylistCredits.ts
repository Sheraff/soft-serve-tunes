function playlistArtistName(
	artistData: {name: string}[],
) {
	const MAX = 3
	if (artistData.length === 0) return ''
	if (artistData.length === 1) return ` by ${artistData[0]!.name}`
	const nameList = artistData.slice(0, MAX).map(({name}) => name)
	const formatter = new Intl.ListFormat('en-US', { style: "short" })
	if (artistData.length <= MAX) {
		return ` by ${formatter.format(nameList)}`
	}
	return ` by ${formatter.format(nameList.concat('others'))}`
}

export default function descriptionFromPlaylistCredits(
	artistData: {name: string}[],
	trackCount: number | undefined
) {
	if (!trackCount) return '0 tracks'

	const names = playlistArtistName(artistData)

	return `${trackCount} track${trackCount > 1 ? 's' : ''}${names}`
}