import { usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList from "components/TrackList"
import { memo, startTransition } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from "./index.module.css"
import AddMoreButton from "./AddMoreButton"

export default memo(function NowPlaying() {
	const {data} = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
	const {setPlaylistIndex} = useSetPlaylistIndex()
	const deleteFromPlaylist = useRemoveFromPlaylist()

	if (!data) return null
	const {tracks, current, id} = data

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
				onReorder={(from, to) => reorderPlaylist(from, to, id)}
				quickSwipeAction={(track) => deleteFromPlaylist(track.id, id)}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
			/>
			{tracks.length < 100 && (
				<AddMoreButton
					id={id}
					tracks={tracks}
				/>
			)}
		</div>
	)
})