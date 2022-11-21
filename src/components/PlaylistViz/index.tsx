import { usePlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import { playlist } from "components/AppContext"
import { useCurrentPlaylist } from "components/AppContext/useCurrentTrack"
import TrackList from "components/TrackList"
import { useAtom } from "jotai"
import { startTransition } from "react"

function rotateList<T>(list: T[], index: number) {
	const _index = (index + list.length) % list.length
	const newList = [...list]
	const end = newList.splice(_index)
	newList.unshift(...end)
	return newList
}

export default function PlaylistViz() {
	// const [{index}, setPlaylist] = useAtom(playlist)
	// const list = useCurrentPlaylist()
	const {data} = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
	const {setPlaylistIndex} = useSetPlaylistIndex()

	if (!data) return null
	const {tracks, index} = data
	const current = tracks[index]?.id

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