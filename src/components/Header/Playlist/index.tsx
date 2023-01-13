import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import { playlistView } from "components/AppContext"
import styles from "./index.module.css"
import TrackList from "components/TrackList"
import { trpc } from "utils/trpc"
import { useReorderPlaylist } from "client/db/useMakePlaylist"
import { useQueryClient } from "@tanstack/react-query"
import Panel from "../Panel"
import CoverImages from "components/NowPlaying/Cover/Images"

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

	const queryClient = useQueryClient()
	const infos = ["test", "yo"]

	const onClickPlay = () => {
		console.log("play", id)
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
			albums={data?.albums}
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