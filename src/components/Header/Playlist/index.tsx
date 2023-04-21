import { type ForwardedRef, forwardRef, startTransition, useImperativeHandle, useRef, useCallback } from "react"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { trpc } from "utils/trpc"
import { setPlaylist, useCurrentTrackDetails, useRemoveFromPlaylist, useReorderPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"
import DeleteIcon from "icons/playlist_remove.svg"
import { autoplay } from "components/Player/Audio"

export default forwardRef(function PlaylistView ({
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
	const { data } = trpc.playlist.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	const description = usePlaylistDescription({
		artistData: data?.artists ?? [],
		length: data?.tracks?.length,
	})
	const infos = [description]

	const onClickPlay = () => {
		if (data) startTransition(() => {
			setPlaylist(data.name, data.tracks, id)
			autoplay.setState(true)
		})
	}

	const current = useCurrentTrackDetails()
	const coverElement = (
		<CoverImages
			albums={data ? data.albums.slice(0, 6) : []}
		/>
	)

	const reorderPlaylist = useReorderPlaylist()
	const _name = data?.name ?? name
	const deleteFromPlaylist = useRemoveFromPlaylist()
	const showHome = useShowHome()

	const parent = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => parent.current as HTMLDivElement)

	const trackListProps = useVirtualTracks({
		tracks: data?.tracks ?? [],
		parent,
		orderable: true,
		virtual: true,
	})

	const { tracks } = trackListProps

	const onReorder = useCallback((from: number, to: number) =>
		reorderPlaylist(from, to, id),
		[id, reorderPlaylist]
	)

	const onQuickSwipe = useCallback((track: { id: string }) =>
		deleteFromPlaylist(track.id, id),
		[id, deleteFromPlaylist]
	)

	const onClick = useCallback((trackId: string) => {
		if (_name && tracks) startTransition(() => {
			setPlaylist(_name, tracks, id, trackId)
			showHome("home")
		})
	}, [_name, id, showHome, tracks])

	return (
		<Panel
			ref={parent}
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
			<TrackList
				{...trackListProps}
				onReorder={onReorder}
				onClick={onClick}
				quickSwipeAction={onQuickSwipe}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
			/>
		</Panel>
	)
})