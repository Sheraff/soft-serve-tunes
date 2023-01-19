import { type Playlist, useAddToPlaylist, usePlaylist, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"
import TrackList from "components/TrackList"
import { memo, startTransition, useState } from "react"
import DeleteIcon from "icons/playlist_remove.svg"
import Cover from "./Cover"
import styles from "./index.module.css"
import MoreIcon from "icons/auto_mode.svg"
import { trpc } from "utils/trpc"
import useIsOnline from "utils/typedWs/useIsOnline"

function AddMoreButton({
	id,
	tracks,
}: {
	id: Playlist["id"],
	tracks: {id: string}[]
}) {
	const addTrackToPlaylist = useAddToPlaylist()
	const [loading, setLoading] = useState(false)
	const {mutateAsync: getMore} = trpc.playlist.more.useMutation()

	const online = useIsOnline()
	if (!online) return null

	const onClick = async () => {
		navigator.vibrate(1)
		// TODO: add JS animation for loading
		setLoading(true)
		const data = await getMore({
			type: "by-similar-tracks",
			trackIds: tracks.map((item) => item.id),
		})
		if (data && data.length > 0) {
			await addTrackToPlaylist(id, data)
		}
		startTransition(() => {
			setLoading(false)
		})
	}

	return (
		<button
			className={styles.more}
			onClick={loading ? undefined : onClick}
		>
			<MoreIcon />
			{loading ? "Loading..." : "Add more tracks"}
		</button>
	)
}

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
			<AddMoreButton
				id={id}
				tracks={tracks}
			/>
		</div>
	)
})