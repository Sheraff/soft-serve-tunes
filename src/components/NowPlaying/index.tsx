import { usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { memo, startTransition, useRef } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from "./index.module.css"
import AddMoreButton from "./AddMoreButton"

export default memo(function NowPlaying () {
	const { data } = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
	const { setPlaylistIndex } = useSetPlaylistIndex()
	const deleteFromPlaylist = useRemoveFromPlaylist()
	const parent = useRef<HTMLDivElement>(null)

	const trackListProps = useVirtualTracks({
		tracks: data?.tracks ?? [],
		parent,
		orderable: true,
		virtual: true,
	})

	if (!data) return null
	const { current, id } = data
	const { tracks } = trackListProps

	return (
		<div className={styles.main} ref={parent}>
			<Cover />
			<TrackList
				current={current}
				onClick={(id) => startTransition(() => {
					setPlaylistIndex(tracks.findIndex((item) => item.id === id))
				})}
				onReorder={(from, to) => reorderPlaylist(from, to, id)}
				quickSwipeAction={(track) => deleteFromPlaylist(track.id, id)}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
				{...trackListProps}
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