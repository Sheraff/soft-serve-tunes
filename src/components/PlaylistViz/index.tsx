import { usePlaylist, useReorderPlaylist } from "client/db/useMakePlaylist"
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
	const [{index}, setPlaylist] = useAtom(playlist)
	// const list = useCurrentPlaylist()
	const {data: list} = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()

	if (!list) return null
	
	const current = list[index]?.id

	return (
		<TrackList
			tracks={list}
			current={current}
			onClick={(id) => startTransition(() => {
				setPlaylist(prev => ({
					...prev,
					index: list.findIndex((item) => item.id === id)
				}))
			})}
			orderable
			onReorder={reorderPlaylist}
		/>
	)
}