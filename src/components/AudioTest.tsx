import styles from "./AudioTest.module.css"
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
			<Suspense>
				<Header/>
			</Suspense>
			{main === "home" && (
				<Suspense>
					<NowPlaying />
				</Suspense>
			)}
			{main === "suggestions" && (
				<Suspense>
					<Suggestions />
				</Suspense>
			)}
			<Suspense>
				<Player />
			</Suspense>
		</div>
	)
}