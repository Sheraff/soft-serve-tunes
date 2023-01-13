import styles from "./AudioTest.module.css"
import Player from "components/Player"
import Header from "components/Header"
import { mainView } from "components/AppContext"
import Suggestions from "components/Suggestions"
import NowPlaying from "components/NowPlaying"
import { usePreloadPlaylist } from "client/db/useMakePlaylist"


export default function AudioTest() {
	const main = mainView.useValue()

	usePreloadPlaylist()

	return (
		<div className={styles.container}>
			<Header/>
			{(main === "home") && (
				<NowPlaying key="home" />
			)}
			{(main === "suggestions") && (
				<Suggestions key="suggestions" />
			)}
			<Player />
		</div>
	)
}