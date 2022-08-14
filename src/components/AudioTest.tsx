import { useCallback, useEffect, useMemo, useRef } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import Search from "./Search"
import Infos from "./Infos"
import Palette from "./Palette"
import Cover from "./Cover"
import { useRouter } from "next/router"
import useRouteParts from "./RouteContext"
import { useQueryClient } from "react-query"
import useIndexedTRcpQuery from "../client/db/useIndexedTRcpQuery"
import PlaylistViz from "./PlaylistViz"
import Test from "./Test"
import Player from "./Player"

export type ListType = "track" | "album" | "artist" | "genre"

export default function AudioTest({ }) {
	const {type, id, index, setRoute} = useRouteParts()

	const { data: list } = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const item = list?.[index]

	const queryClient = useQueryClient()
	const {data: lastfm, isFetching: lastfmLoading} = trpc.useQuery(["lastfm.track", {
		id: item?.id as string,
		force: true,
	}], {
		enabled: Boolean(item?.id),
		onSuccess(lastfm) {
			if (lastfm?.album?.coverId) {
				queryClient.invalidateQueries(["album.cover", {id: lastfm?.album?.entityId}])
			}
		}
	})
	console.log(lastfm)
	// const {data: metadata} = trpc.useQuery(["metadata.track", {id: item?.id as string}], {
	// 	enabled: Boolean(item?.id),
	// })

	const {data: spotify} = trpc.useQuery(["spotify.track", {
		id: item?.id as string,
	}], {
		enabled: Boolean(item?.id),
	})
	console.log(spotify)

	const img = useRef<HTMLImageElement>(null)
	const setPlaylist = useCallback((type: ListType, name: string, id: string) => {
		setRoute({type, name, id})
	}, [setRoute])

	return (
		<>
			<div className={styles.container}>
				<Search setPlaylist={setPlaylist} />
				<div className={styles.content}>
					<Cover id={item?.id} ref={img} />
					<Infos id={item?.id} />
					<PlaylistViz />
				</div>
				<Player />
			</div>
			<Palette img={img} />
			<Test artistId={item?.artistId}/>
		</>
	)
}