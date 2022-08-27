import styles from "./AudioTest.module.css"
import Cover from "components/Cover"
import PlaylistViz from "components/PlaylistViz"
import Player from "components/Player"
import Header from "components/Header"
import Notification from "components/Notification"
import { mainView } from "components/AppContext"
import Palette from "components/Palette"
import Suggestions from "components/Suggestions"
import { useAtomValue } from "jotai"
import { useCurrentTrackDetails } from "components/AppContext/useCurrentTrack"

function GlobalPalette() {
	const data = useCurrentTrackDetails()

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
	const main = useAtomValue(mainView)
	return (
		<>
			<div className={styles.container}>
				<Header/>
					{main === "home" && (
						<NowPlaying />
					)}
					{main === "suggestions" && (
						<Suggestions />
					)}
				<Player />
			</div>
			<GlobalPalette />
			<Notification />
		</>
	)
}