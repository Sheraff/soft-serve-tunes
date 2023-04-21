export type PlaylistTrack = {
	id: string
	name: string
	artist: {
		id: string
		name: string
	} | null
	album: {
		id: string
		name: string
	} | null
}

export type PlaylistDBEntry = {
	/** @description index of order of tracks inside the playlist */
	index: number
	track: PlaylistTrack
}

export type PlaylistMeta = {
	/** @description id of currently playing track */
	current: string | undefined
	name: string
	/** @description id of the server-side playlist (an id is only assigned when the playlist is saved) */
	id: string | null
	/** @description list of track IDs for the playlist, in the order they will be played (in shuffle, this is a different order from `tracks`) */
	order: string[]
}

export type Playlist = PlaylistMeta & {
	/** @description list of tracks for the playlist, in the order they appear visually */
	tracks: PlaylistTrack[]
}