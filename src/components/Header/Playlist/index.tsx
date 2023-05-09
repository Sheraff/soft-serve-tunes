import { type ForwardedRef, forwardRef, useImperativeHandle, useRef, useCallback } from "react"
import styles from "./index.module.css"
import TrackList, { useVirtualTracks } from "components/TrackList"
import { trpc } from "utils/trpc"
import { getPlaylist, setPlaylist, useCurrentTrackDetails, useRemoveFromPlaylist, useReorderPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"
import DeleteIcon from "icons/playlist_remove.svg"
import { autoplay, playAudio } from "components/Player/Audio"
import SaveButton from "components/NowPlaying/Cover/SaveButton"
import { closePanel } from "components/AppContext"

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
	const { data: _data, isLoading } = trpc.playlist.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})
	const frozenData = useRef<typeof _data | null>(null)
	const data = frozenData.current ?? _data

	const onBeforeDelete = () => frozenData.current = data
	const onErrorDelete = () => frozenData.current = null
	const onSuccessDelete = () => closePanel(id)

	const description = usePlaylistDescription({
		artistData: data?.artists ?? [],
		length: data?.tracks?.length,
	})
	const infos = [description]

	const onClickPlay = () => {
		if (data) {
			const playlist = getPlaylist()
			setPlaylist(data.name, data.tracks, id)
			if (playlist?.current && playlist.current === data.tracks[0]?.id) {
				playAudio()
			} else {
				autoplay.setState(true)
			}
		}
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

	const parent = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => parent.current as HTMLDivElement)

	const trackListProps = useVirtualTracks({
		tracks: data?.tracks ?? [],
		parent,
		orderable: true,
		virtual: true,
		loading: isLoading,
	})

	const onReorder = useCallback((from: number, to: number) =>
		reorderPlaylist(from, to, id),
		[id, reorderPlaylist]
	)

	const onQuickSwipe = useCallback((track: { id: string }) =>
		deleteFromPlaylist(track.id, id),
		[id, deleteFromPlaylist]
	)

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
			buttons={<SaveButton
				id={id}
				noText
				onBefore={onBeforeDelete}
				onError={onErrorDelete}
				onSuccess={onSuccessDelete}
			/>}
		>
			<TrackList
				{...trackListProps}
				onReorder={onReorder}
				quickSwipeAction={onQuickSwipe}
				quickSwipeIcon={DeleteIcon}
				quickSwipeDeleteAnim
			/>
		</Panel>
	)
})