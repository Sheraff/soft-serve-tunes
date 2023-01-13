import { type RouterOutputs } from "utils/trpc"

export type PlaylistTrack = Exclude<RouterOutputs["playlist"]["generate"], undefined>[number]

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