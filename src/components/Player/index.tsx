import { useEffect, useMemo, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import Audio from "./Audio"
import useRouteParts from "../RouteContext"
import styles from "./index.module.css"
import useAudio from "./useAudio"
import ProgressInput from "./ProgressInput"

export default function Player() {
	const audio = useRef<HTMLAudioElement>(null)

	const {type, id, index, setIndex} = useRouteParts()
	const { data: list } = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})
	const item = list?.[index]
	
	const playNext = useMemo(() => {
		if(!list?.length) return () => {}
		return () => setIndex((index: number) => (index + 1) % list.length)
	}, [list?.length, setIndex])
	
	const playPrev = useMemo(() => {
		if(!list?.length) return () => {}
		return () => setIndex((index: number) => (index - 1 + list.length) % list.length)
	}, [list?.length, setIndex])

	const [autoPlay, setAutoPlay] = useState(true)
	useEffect(() => {
		const element = audio.current
		if (!element) return
		const controller = new AbortController()
		element.addEventListener('ended', playNext, {signal: controller.signal})
		return () => controller.abort()
	}, [autoPlay, playNext])

	const {
		playing,
		loading,
		displayCurrentTime,
		displayTotalTime,
		seconds,
		totalSeconds,
		progress,
	} = useAudio(audio)

	const togglePlay = () => {
		if (!audio.current) return
		if (playing) {
			audio.current.pause()
		} else {
			audio.current.play()
		}
	}

	return (
		<div className={styles.main}>
			<ProgressInput
				className={styles.progress}
				audio={audio}
				progress={progress}
				canSetTime={Boolean(item && totalSeconds && !loading)}
			/>
			<div className={styles.time}>{displayCurrentTime}</div>
			<div className={styles.duration}>{displayTotalTime}</div>
			<button className={styles.play} onClick={togglePlay}>{playing ? 'pause' : 'play'}</button>
			<button className={styles.prev} onClick={playPrev} disabled={!list?.length || list.length === 1}>⬅︎</button>
			<button className={styles.next} onClick={playNext} disabled={!list?.length || list.length === 1}>➡︎</button>
			<Audio ref={audio}/>
		</div>
	)
}