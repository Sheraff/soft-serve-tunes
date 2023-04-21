import { setPlaylistIndex, usePlaylist, useRemoveFromPlaylist, useReorderPlaylist } from "client/db/useMakePlaylist"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { memo, startTransition, useCallback, useRef } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from "./index.module.css"
import AddMoreButton from "./AddMoreButton"
import { autoplay, playAudio } from "components/Player/Audio"

export default memo(function NowPlaying () {
	const { data } = usePlaylist()
	const reorderPlaylist = useReorderPlaylist()
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
	const current = data?.current
	const id = data?.id

	const onTrackClick = useCallback((id: string) => startTransition(() => {
		if (current === id) {
			playAudio()
		} else {
			setPlaylistIndex(tracks.findIndex((item) => item.id === id))
			autoplay.setState(true)
		}
	}), [tracks, current])

	const onReorder = useCallback((from: number, to: number) =>
		reorderPlaylist(from, to, id),
		[id, reorderPlaylist]
	)

	const onQuickSwipe = useCallback((track: { id: string }) =>
		deleteFromPlaylist(track.id, id),
		[id, deleteFromPlaylist]
	)

	if (!data) return null

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
					id={id!}
					tracks={tracks}
				/>
			)}
		</div>
	)
})