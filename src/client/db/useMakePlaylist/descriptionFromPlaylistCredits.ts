import pluralize from "utils/pluralize"

function playlistArtistName(
	artistData: {name: string}[],
	handlebars: boolean,
) {
	const MAX = 3
	if (artistData.length === 0) return ""
	if (artistData.length === 1) return handlebars ? " by {{name}}" : ` by ${artistData[0]!.name}`
	const nameList = artistData.slice(0, MAX).map(({name}) => {
		if (handlebars)
			return "{{name}}"
		else
			return name
	})
	const formatter = new Intl.ListFormat("en-US", { style: "short" })
	if (artistData.length <= MAX) {
		return ` by ${formatter.format(nameList)}`
	}
	return ` by ${formatter.format(nameList.concat("others"))}`
}

/**
 * @description generates a description for a playlist based on the main artists in the playlist
 * @param artistData artists sorted by prevalence (from `extractPlaylistCredits` for example)
 * @param trackCount number of tracks in the playlist
 * @param handlebars whether to use handlebars syntax for artist names (so that they can be replaced with components), or plain text
 */
export default function descriptionFromPlaylistCredits(
	artistData: {name: string}[],
	trackCount: number | undefined,
	handlebars = false
) {
	if (!trackCount) return "0 tracks"

	const names = playlistArtistName(artistData, handlebars)

	return `${trackCount} track${pluralize(trackCount)}${names}`
}