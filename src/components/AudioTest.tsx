import { useEffect, useRef, useState } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc";
import { useQueryClient } from "react-query";

const store = Symbol()

export default function AudioTest({ }) {
	const audio = useRef<HTMLAudioElement & {[store]: string}>(null)
	const [current, setCurrent] = useState(-1)

	const { data: list, isLoading } = trpc.useQuery(["list.all"])

	const { mutate } = trpc.useMutation(["list.populate"])
	const client = useQueryClient()
	useEffect(() => {
		console.log('populate')
		mutate(undefined, {onSuccess: () => {
			console.log('success')
			client.invalidateQueries(["list.all"])
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

	return (
		<div>
			<div>
			<audio controls ref={audio} playsInline src={item && `/api/file/${item.id}`} autoPlay/>
			</div>
			<div>
			<select onChange={(event) => setCurrent(Number(event.target.value))} value={current}>
				<option disabled value="-1">---</option>
				{list?.map((item, index) => <option key={index} value={index}>{item.artists?.[0]?.artist?.name} - {item.name}</option>)}
			</select>
			</div>
			<div>
				<img className={styles.img} src={item && `/api/cover/${item.pictureId}`} alt=""/>
			</div>
		</div>
	)
}