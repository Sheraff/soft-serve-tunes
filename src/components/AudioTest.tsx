import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import { useQueryClient } from "react-query"
import useImagePalette from "./useImagePalette"
import Search from "./Search"
import Infos from "./Infos"

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [id, setId] = useState("")

	const { data: list, isLoading } = trpc.useQuery(["list.all"], {
		onSuccess(list) {
			if(list)
				setId(list[Math.floor(Math.random() * list.length) | 0].id)
		}
	})

	useEffect(() => {
		if (!audio.current || !list?.length)
			return
		const controller = new AbortController()
		audio.current.addEventListener('ended', () => {
			setId(list[Math.floor(Math.random() * list.length) | 0].id)
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [list])

	const {data: lastfm, isFetching: lastfmLoading} = trpc.useQuery(["lastfm.track", {id}], {
		enabled: Boolean(id),
	})
	console.log(lastfm)
	
	const {data: metadata} = trpc.useQuery(["metadata.track", {id}], {
		enabled: Boolean(id),
	})
	console.log(metadata)

	const imgSrc = useMemo(() => {
		if (!id || lastfmLoading) return undefined
		if (lastfm?.album?.image) {
			const base = lastfm.album.image
			const sizeRegex = /\/i\/u\/([^\/]*)\//
			const src = base.replace(sizeRegex, "/i/u/500x500/")
			return src
		}
		// if (item.pictureId) {
		// 	return `/api/cover/${item.pictureId}`
		// }
		return undefined
	}, [id, lastfm, lastfmLoading])

	const img = useRef<HTMLImageElement>(null)
	const palette = useImagePalette({ref: img})

	return (
		<div className={styles.main} style={{
			'--background-color': palette.background,
			'--gradient-color': palette.gradient,
			'--foreground-color': palette.foreground,
		} as React.CSSProperties}>
			<div>
				<audio
					className={styles.audio}
					controls
					ref={audio}
					playsInline
					src={id && `/api/file/${id}`}
					autoPlay
				/>
			</div>
			<Search setId={setId} />
			<div>
				<img className={styles.img} src={imgSrc} alt="" ref={img} crossOrigin="anonymous"/>
			</div>
			<Infos id={id} />
		</div>
	)
}