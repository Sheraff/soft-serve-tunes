import { type ForwardedRef, forwardRef, useDeferredValue, startTransition } from "react"
import { playlistView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import { trpc } from "utils/trpc"
import { useCurrentTrackDetails, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"
import DeleteIcon from "icons/playlist_remove.svg"

export default forwardRef(function PlaylistView({
	open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const playlist = playlistView.useValue()

	const enabled = Boolean(id && playlist.open)
	const {data} = trpc.playlist.get.useQuery({id}, {
		enabled,
		keepPreviousData: true,
	})

	const description = usePlaylistDescription({
		artistData: data?.artists ?? [],
		length: data?.tracks?.length,
	})
	const infos = [description]

	const setPlaylist = useSetPlaylist()
	const onClickPlay = () => {
		if (data) startTransition(() => {
			setPlaylist(data.name, id, data.tracks)
		})
	}

	const current = useCurrentTrackDetails()
	const coverElement = (
		<CoverImages
			albums={data ? data.albums.slice(0, 6) : []}
		/>
	)

	const reorderPlaylist = useReorderPlaylist()
	const tracks = useDeferredValue(data?.tracks)
	const name = data?.name
	const deleteFromPlaylist = useRemoveFromPlaylist()
	const showHome = useShowHome()
	return (
		<Panel
			ref={ref}
			open={open}
			z={z}
			view={playlist}
			coverPalette={current?.cover?.palette}
			coverElement={coverElement}
			infos={infos}
			title={data?.name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
		>
			{tracks && Boolean(tracks.length) && (
				<TrackList
					tracks={tracks}
					orderable
					onReorder={(oldIndex, newIndex) => {
						reorderPlaylist(oldIndex, newIndex, id)
					}}
					onClick={(trackId) => {
						if (name && tracks) startTransition(() => {
							setPlaylist(name, id, tracks, trackId)
							showHome("home")
						})
					}}
					quickSwipeAction={(track) => {
						deleteFromPlaylist(track.id, id)
					}}
					quickSwipeIcon={DeleteIcon}
					quickSwipeDeleteAnim
				/>
			)}
		</Panel>
	)
})