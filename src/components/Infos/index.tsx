import styles from './index.module.css'
import useIndexedTRcpQuery from '../../client/db/useIndexedTRcpQuery'
import { useAppState } from '../AppContext'

export default function Infos({
	id,
}: {
	id?: string,
}) {
	const {data: item, isLoading: trackLoading} = useIndexedTRcpQuery(["track.get", {id: id as string}], {
		enabled: Boolean(id),
	})
	const {setAppState} = useAppState()
	return (
		<div className={styles.info}>
			<button
				type="button"
				onClick={() => setAppState({view: {type: "artist", id: item?.artist?.id}})}
			>
				{item?.artist?.name}
			</button>
			<p>{item?.album?.name}</p>
			<p>{item?.name}</p>
		</div>
	)
}