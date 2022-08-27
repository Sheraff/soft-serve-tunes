import { playlist } from "components/AppContext"
import { useCurrentPlaylist } from "components/AppContext/useCurrentTrack"
import TrackList from "components/TrackList"
import { useAtom } from "jotai"

function rotateList<T>(list: T[], index: number) {
	const _index = (index + list.length) % list.length
	const newList = [...list]
	const end = newList.splice(_index)
	newList.unshift(...end)
	return newList
}

export default function PlaylistViz() {
	const [{index}, setPlaylist] = useAtom(playlist)
	const list = useCurrentPlaylist()

	if (!list) return null
	
	const current = list[index]?.id

	return (
		<TrackList
			tracks={rotateList(list, index - 1)}
			current={current}
			onClick={(id) => setPlaylist(prev => ({
				...prev,
				index: list.findIndex((item) => item.id === id)
			}))}
		/>
	)
}