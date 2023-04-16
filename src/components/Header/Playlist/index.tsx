import { type ForwardedRef, forwardRef, startTransition, useImperativeHandle, useRef } from "react"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { trpc } from "utils/trpc"
import { useCurrentTrackDetails, useRemoveFromPlaylist, useReorderPlaylist, useSetPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"
import DeleteIcon from "icons/playlist_remove.svg"

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
				onReorder={(oldIndex, newIndex) => {
					reorderPlaylist(oldIndex, newIndex, id)
				}}
				onClick={(trackId) => {
					if (_name && trackListProps.tracks) startTransition(() => {
						setPlaylist(_name, trackListProps.tracks, id, trackId)
						showHome("home")
					})
				}}
				quickSwipeAction={(track) => {
					deleteFromPlaylist(track.id, id)
				}}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
			/>
		</Panel>
	)
})