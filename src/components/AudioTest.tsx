import styles from "./AudioTest.module.css"
import Cover from "components/Cover"
import PlaylistViz from "components/PlaylistViz"
import Player from "components/Player"
import Header from "components/Header"
import Notification from "components/Notification"
import { useAppState } from "components/AppContext"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import Palette from "./Palette"
import Suggestions from "./Suggestions"

function GlobalPalette() {
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
		<Palette
			palette={data?.cover ? JSON.parse(data.cover.palette) : undefined}
		/>
	)
}

function NowPlaying() {
	return (
		<div className={styles.content}>
			<Cover />
			<PlaylistViz />
		</div>
	)
}

export default function AudioTest() {
	const {main} = useAppState()
	return (
		<>
			<div className={styles.container}>
				<Header/>
					{main.type === "home" && (
						<NowPlaying />
					)}
					{main.type === "suggestions" && (
						<Suggestions />
					)}
				<Player />
			</div>
			<GlobalPalette />
			<Notification />
		</>
	)
}