import { memo, startTransition, Suspense, useCallback, useEffect, useRef, useState } from "react"
import Audio from "./Audio"
import { playlist } from "components/AppContext"
import styles from "./index.module.css"
import useAudio from "./useAudio"
import ProgressInput from "./ProgressInput"
import PrevIcon from "icons/skip_previous.svg"
import NextIcon from "icons/skip_next.svg"
import PauseIcon from "icons/pause.svg"
import PlayIcon from "icons/play_arrow.svg"
import OfflineIcon from "icons/wifi_off.svg"
import SlidingText from "./SlidingText"
import { trpc } from "utils/trpc"
import { useAtom, useSetAtom } from "jotai"
import { useCurrentPlaylist, useCurrentTrack } from "components/AppContext/useCurrentTrack"
import asyncPersistedAtom from "components/AppContext/asyncPersistedAtom"
import GlobalPalette from "./GlobalPalette"
import Notification from "components/Notification"
import useCachedTrack from "client/sw/useCachedTrack"
import useIsOnline from "client/sw/useIsOnline"
import Head from "next/head"

export const playerDisplayRemaining = asyncPersistedAtom<boolean>("playerDisplayRemaining", false)

function RightTimeSlot({
	displayRemainingTime,
	displayTotalTime,
}: {
	displayRemainingTime: string
	displayTotalTime: string
}) {
	const [displayRemaining, setDisplayRemaining] = useAtom(playerDisplayRemaining)
	const switchEndTime = () => setDisplayRemaining(a => !a)
	return (
		<button
			type="button"
			className={styles.duration}
			onClick={switchEndTime}
		>
			{displayRemaining ? `-${displayRemainingTime}` : displayTotalTime}
		</button>
	)
}

export default memo(function Player() {
	const audio = useRef<HTMLAudioElement>(null)
	const setPlaylist = useSetAtom(playlist)
	const list = useCurrentPlaylist()
	const item = useCurrentTrack()
	const nextItem = useCurrentTrack(1)
	
	const playNext = useCallback(
		() => startTransition(() => {
			setPlaylist((value) => ({...value, index: value.index + 1}))
		}),
		[setPlaylist]
	)
	const playPrev = useCallback(
		() => {
			if (audio.current && audio.current.currentTime > 10) {
				audio.current.currentTime = 0
				audio.current.play()
				return
			}
			startTransition(() => {
				setPlaylist((value) => ({...value, index: value.index - 1}))
			})
		},
		[setPlaylist]
	)

	const [autoPlay, setAutoPlay] = useState(true)
	useEffect(() => {
		const element = audio.current
		if (!element) return
		const controller = new AbortController()
		element.addEventListener("ended", () => {
			if (nextItem) {
				element.setAttribute("autoplay", "true")
				element.src = `/api/file/${nextItem.id}`
				element.load()
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

	const togglePlay = useCallback(() => {
		if (!audio.current) return
		if (playing) {
			audio.current.pause()
		} else {
			audio.current.play()
		}
	}, [playing])

	useEffect(() => {
		const controller = new AbortController()
		window.addEventListener('keydown', (event) => {
			if (event.key === ' ' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && event.target?.tagName !== 'INPUT') {
				event.preventDefault()
				event.stopPropagation()
				togglePlay()
			}
		}, {capture: true, passive: false, signal: controller.signal})
		return () => controller.abort()
	}, [togglePlay])

	const consideredPlayed = playedSeconds > 45 || playedSeconds / totalSeconds > 0.4
	const {mutate} = trpc.useMutation(["track.playcount"])
	useEffect(() => {
		if (consideredPlayed && item?.id) {
			mutate({id: item?.id})
		}
	}, [mutate, consideredPlayed, item?.id])

	const online = useIsOnline()
	const {data: cached} = useCachedTrack({id: item?.id})

	return (
		<div className={styles.main}>
			<>
				{online && cached && nextItem && (
					<Head>
						<link
							key={`/api/file/${nextItem.id}`}
							rel="prefetch"
							as="audio"
							href={`/api/file/${nextItem.id}`}
						/>
					</Head>
				)}
			</>
			<ProgressInput
				className={styles.progress}
				audio={audio}
				progress={progress}
				canSetTime={Boolean(item && totalSeconds && !loading)}
				loading={playing && (loading || (!online && !cached))}
			/>
			<div className={styles.time}>{displayCurrentTime}</div>
			<Suspense fallback={<div className={styles.duration}>{displayTotalTime}</div>}>
				<RightTimeSlot
					displayTotalTime={displayTotalTime}
					displayRemainingTime={displayRemainingTime}
				/>
			</Suspense>
			<SlidingText className={styles.info} item={item} />
			<div className={styles.ui}>
				<button className={styles.prev} onClick={playPrev} disabled={!list?.length || list.length === 1}><PrevIcon /></button>
				<>
					{(online || cached) && (
						<button className={styles.play} onClick={togglePlay}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
					)}
					{(!online && !cached) && (
						<OfflineIcon />
					)}
				</>
				<button className={styles.next} onClick={playNext} disabled={!list?.length || list.length === 1}><NextIcon /></button>
			</div>
			<Audio ref={audio}/>
			<GlobalPalette />
			<Notification />
		</div>
	)
})