import { memo, startTransition, Suspense, useCallback, useEffect, useRef } from "react"
import Audio, { autoplay } from "./Audio"
import styles from "./index.module.css"
import useAudio from "./useAudio"
import ProgressInput from "./ProgressInput"
import PrevIcon from "icons/skip_previous.svg"
import NextIcon from "icons/skip_next.svg"
import PauseIcon from "icons/pause.svg"
import PlayIcon from "icons/play_arrow.svg"
import SlidingText from "./SlidingText"
import suspensePersistedState from "client/db/suspensePersistedState"
import GlobalPalette from "./GlobalPalette"
import Notification from "components/Player/Notification"
import { useCachedTrack } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCurrentTrack, usePlaylist, shufflePlaylist, prevPlaylistIndex, nextPlaylistIndex } from "client/db/useMakePlaylist"
import ShuffleIcon from "icons/shuffle.svg"
import RepeatIcon from "icons/repeat.svg"
import RepeatOneIcon from "icons/repeat_one.svg"
import NextTrack from "./NextTrack"

export const playerDisplayRemaining = suspensePersistedState<boolean>("playerDisplayRemaining", false)
export const shuffle = suspensePersistedState<boolean>("shuffle", false)
/**
 * @description
 * - 0: false
 * - 1: repeat all
 * - 2: repeat one
 */
export const repeat = suspensePersistedState<0 | 1 | 2>("repeat", 0)

function RightTimeSlot ({
	displayRemainingTime,
	displayTotalTime,
}: {
	displayRemainingTime: string
	displayTotalTime: string
}) {
	const [displayRemaining, setDisplayRemaining] = playerDisplayRemaining.useState()
	const switchEndTime = () => {
		navigator.vibrate(1)
		startTransition(() => {
			setDisplayRemaining(a => !a)
		})
	}
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

function ShuffleButton () {
	const isShuffle = shuffle.useValue()

	const onClick = useCallback(() => {
		shufflePlaylist()
		navigator.vibrate(1)
	}, [])

	return (
		<button
			className={isShuffle ? styles.enabled : undefined}
			onClick={onClick}
		>
			<ShuffleIcon />
		</button>
	)
}

function RepeatButton () {
	const [repeatType, setRepeatType] = repeat.useState()

	const cycleRepeatTypes = useCallback(() => {
		navigator.vibrate(1)
		startTransition(() => {
			setRepeatType((repeatType = 0) => (repeatType + 1) % 3 as 0 | 1 | 2)
		})
	}, [setRepeatType])

	return (
		<button
			className={repeatType ? styles.enabled : undefined}
			onClick={cycleRepeatTypes}
		>
			{repeatType === 2 ? <RepeatOneIcon /> : <RepeatIcon />}
		</button>
	)
}

export default memo(function Player () {
	const audio = useRef<HTMLAudioElement>(null)
	const { data: playlist } = usePlaylist()
	const item = useCurrentTrack()

	const playPrev = useCallback(
		async () => {
			if (audio.current && audio.current.currentTime > 10) {
				audio.current.currentTime = 0
				audio.current.play()
				return
			}
			const hasPrev = await prevPlaylistIndex()
			if (hasPrev) {
				navigator.vibrate(1)
			}
		},
		[]
	)
	const playNext = useCallback(
		async () => {
			const hasNext = await nextPlaylistIndex(audio)
			if (hasNext) {
				navigator.vibrate(1)
			}
		},
		[]
	)

	const {
		playing,
		loading,
		displayCurrentTime,
		displayTotalTime,
		displayRemainingTime,
		totalSeconds,
		progress,
	} = useAudio(audio)

	const togglePlay = useCallback(() => {
		if (!audio.current) return
		navigator.vibrate(1)
		if (playing) {
			audio.current.pause()
		} else {
			audio.current.play()
			autoplay.setState(true)
		}
	}, [playing])

	useEffect(() => {
		const controller = new AbortController()
		window.addEventListener("keydown", (event) => {
			// @ts-expect-error -- it's fine if tagName doesn't exist, the value will just be undefined and it works
			const tagName = event.target?.tagName as string | undefined
			// @ts-expect-error -- it's fine if contentEditable doesn't exist, the value will just be undefined and it works
			const editable = event.target?.contentEditable as string | undefined
			if (event.key === " " && !event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey && tagName !== "INPUT" && editable !== "true") {
				event.preventDefault()
				event.stopPropagation()
				togglePlay()
			}
		}, { capture: true, passive: false, signal: controller.signal })
		return () => controller.abort()
	}, [togglePlay])

	const online = useIsOnline()
	const { data: cached } = useCachedTrack({ id: item?.id })

	const hasPrevNext = playlist && playlist.tracks.length > 1

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
					<ShuffleButton />
				</Suspense>
				<button onClick={playPrev} disabled={!hasPrevNext}><PrevIcon /></button>
				<button onClick={togglePlay} disabled={!item}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
				<button onClick={playNext} disabled={!hasPrevNext}><NextIcon /></button>
				<Suspense fallback={<button><RepeatIcon /></button>}>
					<RepeatButton />
				</Suspense>
			</div>
			<Audio ref={audio} />
			<GlobalPalette />
			<Notification audio={audio} />
			<Suspense>
				<NextTrack audio={audio} id={item?.id} />
			</Suspense>
		</div>
	)
})