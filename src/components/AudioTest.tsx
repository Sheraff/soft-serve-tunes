import styles from "./AudioTest.module.css"
import Player from "components/Player"
import Header from "components/Header"
import { mainView } from "components/AppContext"
import Suggestions from "components/Suggestions"
import NowPlaying from "components/NowPlaying"
import { useEffect, useRef, useState } from "react"
import { usePreloadPlaylist } from "client/db/useMakePlaylist"


export default function AudioTest() {
	const main = mainView.useValue()
	const [display, setDisplay] = useState<typeof main>(main)

	const home = useRef<HTMLDivElement>(null)
	const suggestions = useRef<HTMLDivElement>(null)

	usePreloadPlaylist()

	useEffect(() => {
		if (main !== display) {
			const elements = {
				home: home.current,
				suggestions: suggestions.current,
			}
			const prev = elements[display]
			const next = elements[main]
			if (!prev || !next) {
				setDisplay(main)
				console.error(`Invalid main view display transition: ${display} -> ${main}`)
				return
			}
			const DURATION = 500
			const exit = prev.animate([
				{transform: "scale(1) rotateY(0deg)", offset: 0},
				{transform: "scale(0.85) rotateY(90deg)", offset: 1},
			], {
				duration: DURATION / 2,
				fill: "both",
				easing: "ease-in",
			})
			const entry = next.animate([
				{transform: "scale(0.85) rotateY(-90deg)", offset: 0},
				{transform: "scale(1) rotateY(0deg)", offset: 1},
			], {
				duration: DURATION / 2,
				fill: "backwards",
				easing: "ease-out",
				delay: DURATION / 2,
			})
			Promise.all([exit.finished, entry.finished]).then(() => {
				setDisplay(main)
			})
		}
	}, [main, display])

	const homeNode = (main !== display || display === "home") && (
		<NowPlaying key="home" ref={home} />
	)

	const suggestionsNode = (main !== display || display === "suggestions") && (
		<Suggestions key="suggestions" ref={suggestions} />
	)

	return (
		<div className={styles.container}>
			<Header/>
			{display === "home" && (
				<>
					{suggestionsNode}
					{homeNode}
				</>
			)}
			{display === "suggestions" && (
				<>
					{homeNode}
					{suggestionsNode}
				</>
			)}
			<Player />
		</div>
	)
}