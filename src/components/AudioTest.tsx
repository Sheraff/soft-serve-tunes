import { useRef } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import Infos from "./Infos"
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
	const {data: lastfm} = trpc.useQuery(["lastfm.track", {
		id: item?.id as string,
		force: true,
	}], {
		enabled: Boolean(item?.id),
		onSuccess(lastfm) {
			if (lastfm?.album?.coverId) {
				queryClient.invalidateQueries(["album.miniature", {id: lastfm?.album?.entityId}])
				queryClient.invalidateQueries(["track.miniature", {id: lastfm.entityId}])
			}
		}
	})
	// const {data: metadata} = trpc.useQuery(["metadata.track", {id: item?.id as string}], {
	// 	enabled: Boolean(item?.id),
	// })

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

	const img = useRef<HTMLImageElement>(null)


	return (
		<>
			<div className={styles.container}>
				<Header/>
				<div className={styles.content}>
					<Cover ref={img} />
					<Infos id={item?.id} />
					<PlaylistViz />
				</div>
				<Player />
			</div>
			<Palette img={img} />
			<Notification />
			<Test artistId={item?.artistId}/>
		</>
	)
}