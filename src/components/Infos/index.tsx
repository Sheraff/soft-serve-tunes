import styles from './index.module.css'
import { trpc } from "../../utils/trpc"

export default function Infos({
	id,
}: {
	id: string
}) {
	const {data: item, isLoading: trackLoading} = trpc.useQuery(["track.get", {id}], {
		enabled: Boolean(id),
	})
	return (
		<div className={styles.info}>
			<p>{item?.artist?.name}</p>
			<p>{item?.album?.name}</p>
			<p>{item?.name}</p>
		</div>
	)
}