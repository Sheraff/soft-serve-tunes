import { useCurrentTrackDetails } from "client/db/useMakePlaylist"
import styles from "./index.module.css"

export default function Cover() {
	const data = useCurrentTrackDetails()
	return (
		<img
			className={styles.img}
			src={data?.cover ? `/api/cover/${data.cover.id}` : ""}
			alt=""
		/>
	)
}