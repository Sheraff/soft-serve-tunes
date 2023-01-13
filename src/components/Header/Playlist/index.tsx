import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import { playlistView } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import { trpc } from "utils/trpc"
import { useReorderPlaylist, useSetPlaylist } from "client/db/useMakePlaylist"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"

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
		if (data)
			setPlaylist(data.name, id, data.tracks)
	}

	const reorderPlaylist = useReorderPlaylist()
	const tracks = useDeferredValue(data?.tracks)
	const children = useMemo(() => tracks && Boolean(tracks.length) && (
		<>
			<TrackList
				tracks={tracks}
				orderable
				onReorder={(oldIndex, newIndex) => {
					reorderPlaylist(oldIndex, newIndex, id)
				}}
			/>
		</>
	), [id, reorderPlaylist, tracks])

	const coverElement = (
		<CoverImages
			albums={data ? data.albums.slice(0, 6) : []}
		/>
	)

	return (
		<Panel
			ref={ref}
			open={open}
			z={z}
			view={playlist}
			coverElement={coverElement}
			infos={infos}
			title={data?.name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
		>
			{children}
		</Panel>
	)
})