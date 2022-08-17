import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useAppState } from "../AppContext"
import TrackList from "../TrackList"

function rotateList<T>(list: T[], index: number) {
	const _index = (index + list.length) % list.length
	const newList = [...list]
	const end = newList.splice(_index)
	newList.unshift(...end)
	return newList
}

export default function PlaylistViz() {
	const {playlist, setAppState} = useAppState()
	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})

	if (!list || !playlist) return null
	
	const current = list[playlist.index]?.id

	return (
		<TrackList
			tracks={rotateList(list, playlist.index - 1)}
			current={current}
			onClick={(id) => setAppState({
				playlist: {
					type: playlist.type,
					id: playlist.id,
					index: list.findIndex((item) => item.id === id)
				}
			})}
		/>
	)
}