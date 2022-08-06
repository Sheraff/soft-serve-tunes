import { useEffect, useRef, useState } from "react"
import { deserialize } from "superjson"
import styles from "./AudioTest.module.css"

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [current, setCurrent] = useState(-1)

	const [list, setList] = useState<[]>([])
	useEffect(() => {
		const controller = new AbortController()
		fetch("/api/list", { signal: controller.signal })
			.then(res => res.json())
			.then((data) => {
				const list = deserialize(data)
				console.log(list)
				setList(list)
				// if(!controller.signal.aborted) {
				// 	setList(Object.keys(list))
				// }
			})
			.catch(() => {})
		return () => controller.abort()
	}, [])

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

	const img = useRef<HTMLImageElement>(null)
	useEffect(() => {
		if(!img.current || current < 0 || !list?.length)
			return
		const controller = new AbortController()
		fetch(`/api/cover/${list[current].pictureId}`, { signal: controller.signal })
			.then(res => res.blob())
			.then(blob => {
				if(controller.signal.aborted || !img.current)
					return
				const url = URL.createObjectURL(blob)
				img.current.src = url
			}).catch(() => {})
		return () => controller.abort()
	}, [current, list])

	return (
		<div>
			<div>
			<audio controls ref={audio} playsInline src={current < 0 ? null : `/api/file/${list[current].id}`} autoPlay/>
			</div>
			<div>
			<select onChange={(event) => setCurrent(Number(event.target.value))} value={current}>
				<option disabled value="-1">---</option>
				{list.map((item, index) => <option key={index} value={index}>{item.artists?.[0]?.artist?.name} - {item.name}</option>)}
			</select>
			</div>
			<div>
				<img ref={img} className={styles.img}/>
			</div>
		</div>
	)
}