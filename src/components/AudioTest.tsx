import styles from "./AudioTest.module.css"
import Cover from "components/Cover"
import PlaylistViz from "components/PlaylistViz"
import Player from "components/Player"
import Header from "components/Header"
import Notification from "components/Notification"

export default function AudioTest({ }) {
	return (
		<>
			<div className={styles.container}>
				<Header/>
				<div className={styles.content}>
					<Cover />
					<PlaylistViz />
				</div>
				<Player />
			</div>
			<Notification />
		</>
	)
}