import styles from "./index.module.css"
import { useCurrentTrackDetails } from "components/AppContext/useCurrentTrack"

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