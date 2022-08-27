import { memo, useCallback, useEffect, useRef, useState } from "react"
import Audio from "./Audio"
import { playlist } from "components/AppContext"
import styles from "./index.module.css"
import useAudio from "./useAudio"
import ProgressInput from "./ProgressInput"
import PrevIcon from "icons/skip_previous.svg"
import NextIcon from "icons/skip_next.svg"
import PauseIcon from "icons/pause.svg"
import PlayIcon from "icons/play_arrow.svg"
import SlidingText from "./SlidingText"
import { trpc } from "utils/trpc"
import { useSetAtom } from "jotai"
import { useCurrentPlaylist, useCurrentTrack } from "components/AppContext/useCurrentTrack"

export default memo(function Player() {
	const audio = useRef<HTMLAudioElement>(null)
	const setPlaylist = useSetAtom(playlist)
	const list = useCurrentPlaylist()
	const item = useCurrentTrack()
	const nextItem = useCurrentTrack(1)
	
	const playNext = useCallback(
		() => setPlaylist((value) => ({...value, index: value.index + 1})),
		[setPlaylist]
	)
	const playPrev = useCallback(
		() => {
			if (audio.current && audio.current.currentTime > 10) {
				audio.current.currentTime = 0
				audio.current.play()
				return
			}
			setPlaylist((value) => ({...value, index: value.index - 1}))
		},
		[setPlaylist]
	)

	const [autoPlay, setAutoPlay] = useState(true)
	useEffect(() => {
		const element = audio.current
		if (!element) return
		const controller = new AbortController()
		element.addEventListener('ended', () => {
			if (nextItem) {
				element.src = `/api/file/${nextItem.id}`
				element.play()
			}
			playNext()
		}, {signal: controller.signal})
		return () => controller.abort()
	}, [autoPlay, playNext, nextItem])

	const {
		playing,
		loading,
		displayCurrentTime,
		displayTotalTime,
		displayRemainingTime,
		totalSeconds,
		playedSeconds,
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

	const [endTime, setEndTime] = useState(false)
	const switchEndTime = () => setEndTime(a => !a)

	const consideredPlayed = playedSeconds > 45 || playedSeconds / totalSeconds > 0.4
	const {mutate} = trpc.useMutation(["track.playcount"])
	useEffect(() => {
		if (consideredPlayed && item?.id) {
			mutate({id: item?.id})
		}
	}, [mutate, consideredPlayed, item?.id])

	return (
		<div className={styles.main}>
			<ProgressInput
				className={styles.progress}
				audio={audio}
				progress={progress}
				canSetTime={Boolean(item && totalSeconds && !loading)}
				loading={playing && loading}
			/>
			<div className={styles.time}>{displayCurrentTime}</div>
			<button
				type="button"
				className={styles.duration}
				onClick={switchEndTime}
			>
				{endTime ? `-${displayRemainingTime}` : displayTotalTime}
			</button>
			<SlidingText className={styles.info} item={item} />
			<div className={styles.ui}>
				<button className={styles.prev} onClick={playPrev} disabled={!list?.length || list.length === 1}><PrevIcon /></button>
				<button className={styles.play} onClick={togglePlay}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
				<button className={styles.next} onClick={playNext} disabled={!list?.length || list.length === 1}><NextIcon /></button>
			</div>
			<Audio ref={audio}/>
		</div>
	)
})