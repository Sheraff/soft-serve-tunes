import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import styles from "./index.module.css"
import { useAppState } from "../AppContext"
import Palette from "../Palette"

export default function Cover() {
	const {playlist} = useAppState()

	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = !list || !playlist ? undefined : list[playlist.index]

	const { data } = useIndexedTRcpQuery(["track.miniature", {
		id: item?.id as string
	}], {
		enabled: Boolean(item?.id),
	})
	return (
		<>
			<img
				className={styles.img}
				src={data?.cover ? `/api/cover/${data.cover.id}` : ""}
				alt=""
			/>
			<Palette palette={data?.cover ? JSON.parse(data.cover.palette) : undefined} />
		</>
	)
}