import styles from "./AudioTest.module.css"
import Cover from "./Cover"
import PlaylistViz from "./PlaylistViz"
import Player from "./Player"
import Header from "./Header"
import Notification from "./Notification"

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