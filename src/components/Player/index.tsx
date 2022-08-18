import { useEffect, useMemo, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import Audio from "./Audio"
import { useAppState } from "../AppContext"
import styles from "./index.module.css"
import useAudio from "./useAudio"
import ProgressInput from "./ProgressInput"
import PrevIcon from "../../icons/skip_previous.svg"
import NextIcon from "../../icons/skip_next.svg"
import PauseIcon from "../../icons/pause.svg"
import PlayIcon from "../../icons/play_arrow.svg"
import SlidingText from "./SlidingText"

export default function Player() {
	const audio = useRef<HTMLAudioElement>(null)

	const {playlist, setAppState} = useAppState()
	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = (!list || !playlist) ? undefined : list[playlist.index]
	
	const playNext = useMemo(() => {
		if(!list?.length) return () => {}
		return () => setAppState(({playlist}) => ({
			playlist: {
				index: playlist?.index === undefined ? undefined : (playlist.index + 1) % list.length,
			}
		}))
	}, [list?.length, setAppState])
	
	const playPrev = useMemo(() => {
		if (!list?.length) return () => {}
		return () => {
			if (audio.current && audio.current.currentTime > 10) {
				audio.current.currentTime = 0
				audio.current.play()
				return
			}
			setAppState(({playlist}) => ({
				playlist: {
					index: playlist?.index === undefined ? undefined : (playlist.index - 1 + list.length) % list.length,
				}
			}))
		}
	}, [list?.length, setAppState])

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
			setAutoPlay(false)
		} else {
			audio.current.play()
			setAutoPlay(true)
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
			<SlidingText className={styles.info} item={item} />
			<div className={styles.ui}>
				<button className={styles.prev} onClick={playPrev} disabled={!list?.length || list.length === 1}><PrevIcon /></button>
				<button className={styles.play} onClick={togglePlay}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
				<button className={styles.next} onClick={playNext} disabled={!list?.length || list.length === 1}><NextIcon /></button>
			</div>
			<Audio ref={audio}/>
		</div>
	)
}