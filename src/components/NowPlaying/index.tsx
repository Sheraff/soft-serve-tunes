import { usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { memo, startTransition, useCallback, useRef } from "react"
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
		exposeScrollFn: true,
	})
	const { tracks } = trackListProps

	const onTrackClick = useCallback((id: string) => startTransition(() => {
		setPlaylistIndex(tracks.findIndex((item) => item.id === id))
	}), [tracks, setPlaylistIndex])

	const onReorder = useCallback((from: number, to: number) =>
		reorderPlaylist(from, to, data?.id),
		[data?.id, reorderPlaylist]
	)

	const onQuickSwipe = useCallback((track: { id: string }) =>
		deleteFromPlaylist(track.id, data?.id),
		[data?.id, deleteFromPlaylist]
	)

	if (!data) return null
	const { current, id } = data

	return (
		<div className={styles.main} ref={parent}>
			<Cover />
			<TrackList
				current={current}
				onClick={onTrackClick}
				onReorder={onReorder}
				quickSwipeAction={onQuickSwipe}
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