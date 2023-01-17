import { type ForwardedRef, forwardRef, useDeferredValue, startTransition } from "react"
import { useShowHome } from "components/AppContext"
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
	rect,
	name,
	isTop,
}: {
	open: boolean
	id: string
	z: number
	rect?: {
		top: number
		left?: number
		width?: number
		height?: number
		src?: string
	}
	name?: string
	isTop: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const enabled = Boolean(id && open)
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
			setPlaylist(data.name, data.tracks, id)
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
	const _name = data?.name ?? name
	const deleteFromPlaylist = useRemoveFromPlaylist()
	const showHome = useShowHome()
	return (
		<Panel
			ref={ref}
			open={open}
			z={z}
			rect={rect}
			coverPalette={current?.cover?.palette}
			coverElement={coverElement}
			infos={infos}
			title={_name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
			isTop={isTop}
		>
			{tracks && Boolean(tracks.length) && (
				<TrackList
					tracks={tracks}
					orderable
					onReorder={(oldIndex, newIndex) => {
						reorderPlaylist(oldIndex, newIndex, id)
					}}
					onClick={(trackId) => {
						if (_name && tracks) startTransition(() => {
							setPlaylist(_name, id, tracks, trackId)
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