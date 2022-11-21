import { usePlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList from "components/TrackList"
import { startTransition } from "react"

export default function PlaylistViz() {
	const {data} = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
	const {setPlaylistIndex} = useSetPlaylistIndex()

	if (!data) return null
	const {tracks, current} = data

	return (
		<TrackList
			tracks={tracks}
			current={current}
			onClick={(id) => startTransition(() => {
				setPlaylistIndex(tracks.findIndex((item) => item.id === id))
			})}
			orderable
			onReorder={reorderPlaylist}
		/>
	)
}