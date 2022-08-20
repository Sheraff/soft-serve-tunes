import { useRef } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import Palette from "./Palette"
import Cover from "./Cover"
import { useAppState } from "./AppContext"
import { useQueryClient } from "react-query"
import useIndexedTRcpQuery from "../client/db/useIndexedTRcpQuery"
import PlaylistViz from "./PlaylistViz"
import Test from "./Test"
import Player from "./Player"
import Header from "./Header"
import Notification from "./Notification"

export type ListType = "track" | "album" | "artist" | "genre"

export default function AudioTest({ }) {
	const {playlist} = useAppState()

	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = !list || !playlist ? undefined : list[playlist.index]

	const queryClient = useQueryClient()

	const {data: spotify} = trpc.useQuery(["spotify.track", {
		id: item?.id as string,
	}], {
		enabled: Boolean(item?.id),
		onSuccess(spotify) {
			if (spotify?.album?.imageId && spotify.trackId) {
				queryClient.invalidateQueries(["track.miniature", {id: spotify.trackId}])
			}
		}
	})

	return (
		<>
			<div className={styles.container}>
				<Header/>
				<div className={styles.content}>
					<Cover />
					<PlaylistViz />
				</div>
				<Player />
			</div>
			<Notification />
			<Test artistId={item?.artistId}/>
		</>
	)
}