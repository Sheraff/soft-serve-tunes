import { memo, Suspense, useCallback, useEffect, useRef, useState } from "react"
import Audio from "./Audio"
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
import { useAtom } from "jotai"
import asyncPersistedAtom from "components/AppContext/asyncPersistedAtom"
import GlobalPalette from "./GlobalPalette"
import Notification from "components/Notification"
import useCachedTrack from "client/sw/useCachedTrack"
import useIsOnline from "client/sw/useIsOnline"
import Head from "next/head"
import { useCurrentTrack, useNextTrack, usePlaylist, useSetPlaylistIndex } from "client/db/useMakePlaylist"

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
	const {data: playlist} = usePlaylist()
	const item = useCurrentTrack()
	const nextItem = useNextTrack()
	const {nextPlaylistIndex: playNext, prevPlaylistIndex} = useSetPlaylistIndex()

	const playPrev = useCallback(
		() => {
			if (audio.current && audio.current.currentTime > 10) {
				audio.current.currentTime = 0
				audio.current.play()
				return
			}
			prevPlaylistIndex()
		},
		[prevPlaylistIndex]
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
			// @ts-expect-error -- it's fine if tagName doesn't exist, the value will just be undefined and it works
			const tagName = event.target?.tagName as string | undefined
			if (event.key === ' ' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && tagName !== 'INPUT') {
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

	const hasPrevNext = playlist && playlist.tracks.length > 1

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
				<button onClick={playPrev} disabled={!hasPrevNext}><PrevIcon /></button>
				<>
					{(online || cached) && (
						<button onClick={togglePlay} disabled={!item}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
					)}
					{(!online && !cached) && (
						<OfflineIcon />
					)}
				</>
				<button onClick={playNext} disabled={!hasPrevNext}><NextIcon /></button>
			</div>
			<Audio ref={audio}/>
			<GlobalPalette />
			<Notification />
		</div>
	)
})