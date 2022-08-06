import { useEffect, useRef, useState } from "react";

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [current, setCurrent] = useState<string>("")

	const [list, setList] = useState<string[]>([])
	useEffect(() => {
		const controller = new AbortController()
		fetch("/api/list", { signal: controller.signal })
			.then(res => res.json())
			.then((list) => {
				if(!controller.signal.aborted) {
					setList(Object.keys(list))
				}
			})
			.catch(() => {})
		return () => controller.abort()
	}, [])

	useEffect(() => {
		if (!audio.current || !current || !list?.length)
			return
		const controller = new AbortController()
		audio.current.addEventListener('ended', () => {
			const index = list.indexOf(current)
			const next = list[(index + 1) % list.length] as string
			setCurrent(next)
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [current, list])

	const img = useRef<HTMLImageElement>(null)
	useEffect(() => {
		if(!img.current || !current)
			return
		const controller = new AbortController()
		fetch(`/api/metadata/${current}`, { signal: controller.signal })
			.then(res => res.json())
			.then(metadata => {
				if(controller.signal.aborted || !img.current)
					return
				const data = metadata?.common?.picture?.[0]?.data.data
				if (data) {
					const array = new Uint8Array(data)
					const blob = new Blob([array.buffer], {type: metadata?.common?.picture?.[0]?.format})
					const url = URL.createObjectURL(blob)
					img.current.src = url
				} else {
					img.current.src = ""
				}
				console.log(metadata)
			}).catch(() => {})
		return () => controller.abort()
	}, [current])

	return (
		<div>
			<div>
			<audio controls ref={audio} playsInline src={`/api/file/${current}`} autoPlay/>
			</div>
			<div>
			<select onChange={(event) => setCurrent(event.target.value)} value={current}>
				<option disabled value="">---</option>
				{list.map((item, index) => <option key={index} value={item}>{item}</option>)}
			</select>
			</div>
			<div>
				<img ref={img} />
			</div>
		</div>
	)
}