import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import { useQueryClient } from "react-query"

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [current, setCurrent] = useState(-1)
	const [progress, setProgress] = useState(0)

	const { data: list, isLoading } = trpc.useQuery(["list.all"])

	const { mutate } = trpc.useMutation(["list.populate"])
	const client = useQueryClient()
	useEffect(() => {
		mutate(undefined, {onSuccess: () => {
			const ws = new WebSocket(`ws://localhost:8080/api/list/populate`)
			performance.mark("lib-pop-start")
			ws.onmessage = (e) => {
				const data = JSON.parse(e.data)
				if (data.type === "done") {
					console.log("populating library: DONE")
					performance.mark("lib-pop-end")
					performance.measure("lib-pop", "lib-pop-start", "lib-pop-end")
					client.invalidateQueries(["list.all"])
					console.log(performance.getEntriesByName("lib-pop").at(-1)?.duration)
					setProgress(1)
					setCurrent(0)
				} else if (data.type === "progress") {
					console.log(`populating library: ${data.payload}%`)
					setProgress(data.payload)
				}
			}
		}})
	}, [mutate, client])

	useEffect(() => {
		if (!audio.current || current < 0 || !list?.length)
			return
		const controller = new AbortController()
		audio.current.addEventListener('ended', () => {
			const next = (current + 1) % list.length
			setCurrent(next)
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [current, list])

	const item = (list && (current in list)) ? list[current] : undefined

	const {data: lastfm} = trpc.useQuery(["lastfm.track", {id: item?.id}], {
		enabled: !!item?.id,
	})
	console.log(lastfm)
	
	const {data: metadata} = trpc.useQuery(["metadata.track", {id: item?.id}], {
		enabled: !!item?.id,
	})
	console.log(metadata)

	// const imgSrc = ""
	const imgSrc = useMemo(() => {
		if (!item) return ""
		if (lastfm?.album?.image) {
			const base = lastfm.album.image
			const sizeRegex = /\/i\/u\/([^\/]*)\//
			const src = base.replace(sizeRegex, "/i/u/500x500/")
			return src
		}
		if (item.pictureId) {
			return `/api/cover/${item.pictureId}`
		}
		return ""
	}, [item, lastfm])

	return (
		<div>
			<div className={styles.progress} style={
				{'--progress': progress} as React.CSSProperties
			}/>
			<div>
				<audio
					className={styles.audio}
					controls
					ref={audio}
					playsInline
					src={item && `/api/file/${item.id}`}
					autoPlay
				/>
			</div>
			<div>
				<select
					className={styles.select}
					onChange={(event) => setCurrent(Number(event.target.value))}
					value={current}
				>
					<option disabled value="-1">---</option>
					{list?.map((item, index) => 
						<option key={index} value={index}>
							{item.artist?.name}
							{' / '}
							{item.album?.name}
							{' / '}
							{item.name}
							{' ['}
							{item.genres.map(genre => genre.genre.name).join(', ')}
							{']'}
						</option>
					)}
				</select>
			</div>
			<div>
				<img className={styles.img} src={imgSrc} alt=""/>
			</div>
		</div>
	)
}