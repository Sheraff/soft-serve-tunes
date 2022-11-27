import { usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList from "components/TrackList"
import { memo, startTransition } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from './index.module.css'

export default memo(function NowPlaying() {
	const {data} = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
	const {setPlaylistIndex} = useSetPlaylistIndex()
	const deleteFromPlaylist = useRemoveFromPlaylist()

	if (!data) return null
	const {tracks, current} = data

	return (
		<div className={styles.main}>
			<Cover />
			<TrackList
				tracks={tracks}
				current={current}
				onClick={(id) => startTransition(() => {
					setPlaylistIndex(tracks.findIndex((item) => item.id === id))
				})}
				orderable
				onReorder={reorderPlaylist}
				quickSwipeAction={({id}) => deleteFromPlaylist(id)}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
			/>
		</div>
	)
})