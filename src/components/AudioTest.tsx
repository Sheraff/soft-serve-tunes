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

const store = Symbol()

export type ListType = "track" | "album" | "artist" | "genre"

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)

	const router = useRouter()
	const {type, name, id, index} = useRouteParts()

	const { data: list } = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const item = list?.[index]
	const playNext = useMemo(() => {
		if(!list?.length) return () => {}
		const next = (index + 1) % list.length
		return () => router.push(`/${type}/${name}/${id}/${next}`)
	}, [list?.length, router, type, name, id, index])
	const playPrev = useMemo(() => {
		if(!list?.length) return () => {}
		const prev = (index - 1 + list.length) % list.length
		return () => router.push(`/${type}/${name}/${id}/${prev}`)
	}, [list?.length, router, type, name, id, index])

	useEffect(() => {
		if (!audio.current) return
		const controller = new AbortController()
		audio.current.addEventListener('ended', playNext, {signal: controller.signal})
		return () => controller.abort()
	}, [playNext])

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

	const img = useRef<HTMLImageElement>(null)
	const setPlaylist = useCallback((type: ListType, name: string, id: string) => {
		router.push(`/${type}/${name.replace(/\s/g, '-')}/${id}`)
	}, [router])

	return (
		<Palette img={img}>
			<div className={styles.player}>
				<button onClick={playPrev} disabled={!list?.length || list.length === 1}>⬅︎</button>
				<audio
					className={styles.audio}
					controls
					ref={audio}
					playsInline
					src={item?.id && `/api/file/${item.id}`}
					autoPlay
				/>
				<button onClick={playNext} disabled={!list?.length || list.length === 1}>➡︎</button>
			</div>
			<Search setPlaylist={setPlaylist} />
			<Cover id={item?.id} ref={img} />
			<Infos id={item?.id} />
			<PlaylistViz />
			<Test artistId={item?.artistId}/>
		</Palette>
	)
}