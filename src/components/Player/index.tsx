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
import { useAtom, useAtomValue } from "jotai"
import asyncPersistedAtom from "client/db/asyncPersistedAtom"
import GlobalPalette from "./GlobalPalette"
import Notification from "components/Player/Notification"
import useCachedTrack from "client/sw/useCachedTrack"
import useIsOnline from "client/sw/useIsOnline"
import { useCurrentTrack, usePlaylist, useSetPlaylistIndex, useShufflePlaylist } from "client/db/useMakePlaylist"
import ShuffleIcon from 'icons/shuffle.svg'
import RepeatIcon from 'icons/repeat.svg'
import RepeatOneIcon from 'icons/repeat_one.svg'
import NextTrack from "./NextTrack"

export const playerDisplayRemaining = asyncPersistedAtom<boolean>("playerDisplayRemaining", false)
export const shuffle = asyncPersistedAtom<boolean>("shuffle", false)
/**
 * 0: false
 * 1: repeat all
 * 2: repeat one
 */
export const repeat = asyncPersistedAtom<0 | 1 | 2>("repeat", 0)

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

	const {
		id: audioSrcId,
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
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === ' ' && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && tagName !== 'INPUT' && editable !== 'true') {
				event.preventDefault()
				event.stopPropagation()
				togglePlay()
			}
		}, {capture: true, passive: false, signal: controller.signal})
		return () => controller.abort()
	}, [togglePlay])

	const consideredPlayed = playedSeconds > 45 || (totalSeconds && playedSeconds / totalSeconds > 0.4)
	const {mutate} = trpc.track.playcount.useMutation()
	useEffect(() => {
		if (consideredPlayed && audioSrcId) {
			mutate({id: audioSrcId})
		}
	}, [mutate, consideredPlayed, audioSrcId])

	const online = useIsOnline()
	const {data: cached} = useCachedTrack({id: item?.id})

	const hasPrevNext = playlist && playlist.tracks.length > 1

	const isShuffle = useAtomValue(shuffle)
	const shufflePlaylist = useShufflePlaylist()
	const [repeatType, setRepeatType] = useAtom(repeat)

	return (
		<div className={styles.main}>
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
				<Suspense fallback={<button><ShuffleIcon /></button>}>
					<button
						className={isShuffle ? styles.enabled : undefined}
						onClick={shufflePlaylist}
					>
						<ShuffleIcon />
					</button>
				</Suspense>
				<button onClick={playPrev} disabled={!hasPrevNext}><PrevIcon /></button>
				<>
					{(online || cached) && (
						<button onClick={togglePlay} disabled={!item}>{playing ? <PauseIcon/> : <PlayIcon/>}</button>
					)}
					{(!online && !cached) && (
						<OfflineIcon />
					)}
				</>
				<button onClick={() => playNext(audio)} disabled={!hasPrevNext}><NextIcon /></button>
				<Suspense fallback={<button><RepeatIcon /></button>}>
					<button
						className={repeatType ? styles.enabled : undefined}
						onClick={() => {
							const nextRepeatType = (repeatType + 1) % 3 as 0 | 1 | 2
							setRepeatType(nextRepeatType)
						}}
					>
						{repeatType === 2 ? <RepeatOneIcon /> : <RepeatIcon />}
					</button>
				</Suspense>
			</div>
			<Audio ref={audio}/>
			<GlobalPalette />
			<Notification audio={audio} />
			<NextTrack audio={audio} id={item?.id}/>
		</div>
	)
})