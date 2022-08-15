import classNames from "classnames"
import { CSSProperties, useMemo } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"
import AlbumMiniature from "../Header/Search/AlbumMiniature"
import styles from "./index.module.css"
import TrackList from "../TrackList"

function rotateList<T>(list: T[], index: number) {
	const _index = (index + list.length) % list.length
	const newList = [...list]
	const end = newList.splice(index)
	newList.unshift(...end)
	return newList
}

export default function PlaylistViz() {
	const {type, id, index, setIndex} = useRouteParts()
	const { data: list} = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const current = list?.[index]?.id

	if (!list) return null

	return (
		<TrackList
			tracks={rotateList(list, index - 1)}
			current={current}
			onClick={(id) => setIndex(list.findIndex((item) => item.id === id))}
		/>
	)
}