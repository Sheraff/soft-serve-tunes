import { useCurrentTrackDetails } from "client/db/useMakePlaylist"
import styles from "./index.module.css"

export default function Cover() {
	const track = useCurrentTrackDetails()
	return (
		<img
			className={styles.img}
			src={track?.cover ? `/api/cover/${track.cover.id}` : ""}
			alt=""
		/>
	)
}