import { type Playlist, usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { memo, startTransition, useRef } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from "./index.module.css"
import AddMoreButton from "./AddMoreButton"

function NowPlayingLoaded ({ data }: { data: Playlist }) {
	const reorderPlaylist = useReorderPlaylist()
	const { setPlaylistIndex } = useSetPlaylistIndex()
	const deleteFromPlaylist = useRemoveFromPlaylist()
	const parent = useRef<HTMLDivElement>(null)
	const { tracks, current, id } = data

	const trackListProps = useVirtualTracks({
		tracks,
		parent,
		orderable: true,
		virtual: true,
	})

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
			{data.tracks.length < 100 && (
				<AddMoreButton
					id={id}
					tracks={tracks}
				/>
			)}
		</div>
	)
}

export default memo(function NowPlaying () {
	const { data } = usePlaylist()
	if (!data) return null
	return <NowPlayingLoaded data={data} />
})