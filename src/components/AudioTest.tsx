import { useEffect, useRef, useState } from "react"
import styles from "./AudioTest.module.css"
import { trpc } from "../utils/trpc"
import Search from "./Search"
import Infos from "./Infos"
import Palette from "./Palette"
import Cover from "./Cover"

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



	const img = useRef<HTMLImageElement>(null)

	return (
		<Palette img={img}>
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
			<Cover id={id} />
			<Infos id={id} />
		</Palette>
	)
}