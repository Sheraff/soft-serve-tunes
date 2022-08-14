import classNames from "classnames"
import { useRouter } from "next/router"
import { CSSProperties, useMemo } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import useRouteParts from "../RouteContext"
import AlbumMiniature from "../Header/Search/AlbumMiniature"
import styles from "./index.module.css"

const DISPLAY_COUNT = 15

function getDisplayList<T>(list: T[] | undefined, index: number): T[] {
	if (!list) return []
	if (list.length < 3) return list

	// TODO: should still center index in output list
	if (list.length < DISPLAY_COUNT) return list

	const beforeCount = Math.floor((DISPLAY_COUNT - 1) / 2)
	if (index > beforeCount) return list.slice(index - beforeCount, index + beforeCount + 1)

	const deltaBefore = beforeCount - index

	const itemsFromStart = list.slice(0, DISPLAY_COUNT - deltaBefore)
	const itemsFromEnd = list.slice(list.length - deltaBefore, list.length)
	return itemsFromEnd.concat(itemsFromStart)
}

export default function PlaylistViz() {
	const {type, id, index, setIndex} = useRouteParts()
	const { data: list} = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const current = list?.[index]?.id
	const display = useMemo(() => getDisplayList(list, index), [list, index])

	return (
		<div className={styles.main} style={{'--count': display.length} as CSSProperties}>
			{display.map((item) => (
				<button
					key={item.id}
					className={classNames(styles.item, {
						[styles.current]: item.id === current,
					})}
					onClick={() => setIndex(list?.findIndex((i) => i.id === item.id) ?? 0)}
				>
					<AlbumMiniature id={item.album?.id} />
					<div className={styles.text}>
						<p>{item.name}</p>
						{item.artist && <p>{item.artist.name}</p>}
						{item.album && <p>{item.album.name}</p>}
					</div>
				</button>
			))}
		</div>
	)
}