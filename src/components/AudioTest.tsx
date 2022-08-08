import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import Search from "./Search"
import Infos from "./Infos"
import Palette from "./Palette"
import Cover from "./Cover"

const store = Symbol()

type ListType = "track" | "album" | "artist" | "genre"

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)

	const [listType, setListType] = useState<ListType | "">("")
	const [id, setId] = useState("")
	const [index, setIndex] = useState(0)
	const { data: list } = trpc.useQuery(["playlist.generate", { type: listType, id }], {
		enabled: Boolean(listType && id),
		onSuccess: () => setIndex(0),
	})

	const item = list?.[index]
	const playNext = useMemo(() => {
		if(!list?.length) return () => {}
		return () => setIndex((i) => (i + 1) % list.length)
	}, [list?.length])
	const playPrev = useMemo(() => {
		if(!list?.length) return () => {}
		return () => setIndex((i) => (i - 1 + list.length) % list.length)
	}, [list?.length])

	useEffect(() => {
		if (!audio.current) return
		const controller = new AbortController()
		audio.current.addEventListener('ended', playNext, {signal: controller.signal})
		return () => controller.abort()
	}, [playNext])

	const {data: lastfm, isFetching: lastfmLoading} = trpc.useQuery(["lastfm.track", {id: item?.id as string}], {
		enabled: Boolean(item?.id),
	})
	// const {data: metadata} = trpc.useQuery(["metadata.track", {id: item?.id as string}], {
	// 	enabled: Boolean(item?.id),
	// })

	const img = useRef<HTMLImageElement>(null)
	const setPlaylist = useCallback((type: ListType, id: string) => {
		setListType(type)
		setId(id)
	}, [])

	return (
		<Palette img={img}>
			<div className={styles.player}>
				<button onClick={playPrev} disabled={!list?.length}>⬅︎</button>
				<audio
					className={styles.audio}
					controls
					ref={audio}
					playsInline
					src={item?.id && `/api/file/${item.id}`}
					autoPlay
				/>
				<button onClick={playNext} disabled={!list?.length}>➡︎</button>
			</div>
			<Search setPlaylist={setPlaylist} />
			<Cover id={item?.id} ref={img} />
			<Infos id={item?.id} />
		</Palette>
	)
}