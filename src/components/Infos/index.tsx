import styles from './index.module.css'
import useIndexedTRcpQuery from '../../client/db/useIndexedTRcpQuery'

export default function Infos({
	id,
}: {
	id?: string,
}) {
	const {data: item, isLoading: trackLoading} = useIndexedTRcpQuery(["track.get", {id: id as string}], {
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