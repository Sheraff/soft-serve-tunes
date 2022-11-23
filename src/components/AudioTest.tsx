import styles from "./AudioTest.module.css"
import Cover from "components/NowPlaying/Cover"
import PlaylistViz from "components/NowPlaying"
import Player from "components/Player"
import Header from "components/Header"
import { mainView } from "components/AppContext"
import Suggestions from "components/Suggestions"
import { useAtomValue } from "jotai"
import { Suspense } from "react"
import NowPlaying from "components/NowPlaying"


export default function AudioTest() {
	const main = useAtomValue(mainView)
	return (
		<div className={styles.container}>
			<Header/>
			{main === "home" && (
				<Suspense>
					<NowPlaying />
				</Suspense>
			)}
			{main === "suggestions" && (
				<Suggestions />
			)}
			<Suspense>
				<Player />
			</Suspense>
		</div>
	)
}