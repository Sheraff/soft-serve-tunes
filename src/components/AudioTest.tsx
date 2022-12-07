import styles from "./AudioTest.module.css"
import Player from "components/Player"
import Header from "components/Header"
import { mainView } from "components/AppContext"
import Suggestions from "components/Suggestions"
import NowPlaying from "components/NowPlaying"


export default function AudioTest() {
	const main = mainView.useValue()
	return (
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
	)
}