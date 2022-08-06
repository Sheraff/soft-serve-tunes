import { useEffect, useRef, useState } from "react";

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [list, setList] = useState<string[]>([])
	const [current, setCurrent] = useState<string>("")
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
		if (!audio.current || !current || current === audio.current[store])
			return
		audio.current[store] = current
		audio.current.setAttribute("src", `/api/file/${current}`)
		performance.mark("audio-src")
		audio.current.onplaying = () => {
			performance.mark("audio-play")
			performance.measure("audio-load", "audio-play", "audio-src")
		}
		audio.current.onended = () => {
			const index = list.indexOf(current)
			const next = list[(index + 1) % list.length] as string
			setCurrent(next)
		}
		audio.current.play()
	}, [current, list])

	return (
		<div>
			<audio controls ref={audio} playsInline/>
			<select onChange={(event) => setCurrent(event.target.value)} defaultValue="" value={current}>
				<option disabled value="">---</option>
				{list.map((item, index) => <option key={index} value={item}>{item}</option>)}
			</select>
		</div>
	)
}