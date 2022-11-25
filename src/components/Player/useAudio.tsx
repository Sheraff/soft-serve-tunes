import { RefObject, useEffect, useMemo, useRef, useState } from "react"

type TimeVector = [number, number, number]

 function secondsToTimeVector(seconds: number): TimeVector {
	const restSeconds = seconds % 60
	const minutes = (seconds - restSeconds) / 60
	const restMinutes = minutes % 60
	const hours = (minutes - restMinutes) / 60
	const floatVector = [hours, restMinutes, restSeconds] as const
	return floatVector.map(Math.floor) as TimeVector
}

function arrayToTimeDisplayString(array: number[]) {
	return array
		.map((num) => num.toString().padStart(2, '0'))
		.join(':')
}

function pairOfTimeVectorsToPairOfDisplayStrings(vectors: [TimeVector, TimeVector, TimeVector]): [string, string, string] {
	if (vectors[0][0] === 0 && vectors[1][0] === 0) {
		return vectors.map((vec) => arrayToTimeDisplayString([vec[1], vec[2]])) as [string, string, string]
	}
	return vectors.map(arrayToTimeDisplayString) as [string, string, string]
}

export default function useAudio(audio: RefObject<HTMLAudioElement>) {
	const [seconds, setSeconds] = useState(0) // current time
	const [totalSeconds, setTotalSeconds] = useState(0) // total time of source
	const [playing, setPlaying] = useState(false) // follows state of DOM node
	const [loading, setLoading] = useState(true)
	const [playedSeconds, setPlayedSeconds] = useState(0) // how long the source has been playing (excludes loading / stalled / seeking)
	const remainingSeconds = totalSeconds - seconds

	const [displayCurrentTime, displayTotalTime, displayRemainingTime] = useMemo(() => {
		const currentTimeVector = secondsToTimeVector(seconds)
		const totalTimeVector = secondsToTimeVector(totalSeconds)
		const remainingTimeVector = secondsToTimeVector(remainingSeconds)
		return pairOfTimeVectorsToPairOfDisplayStrings([currentTimeVector, totalTimeVector, remainingTimeVector])
	}, [seconds, totalSeconds, remainingSeconds])

	useEffect(() => {
		const element = audio.current
		if (!element) return

		let currentSrc: string
		let currentPlayedSectionStart: number
		let loading = true

		const _setLoading = (bool: boolean) => {
			setLoading(bool)
			loading = bool
		}

		const onDuration = () => {
			const {duration, src} = element
			if (!Number.isNaN(duration) && (src === currentSrc)) {
				setTotalSeconds(duration)
				navigator.mediaSession.setPositionState({
					duration: element.duration,
					playbackRate: element.playbackRate,
					position: element.currentTime,
				})
			}
		}

		const onTimeUpdate = () => {
			const {currentTime, src} = element
			if (!Number.isNaN(currentTime) && (src === currentSrc)) {
				setSeconds(currentTime)
				// onDuration() // TODO: shouldn't have to be called every time
				if (!loading) {
					const delta = currentTime - currentPlayedSectionStart
					setPlayedSeconds(prev => prev + delta)
				}
				currentPlayedSectionStart = currentTime
			}
		}

		// onPlay / onPause reflect the intention of the user, but `onPlay` doesn't mean audio is actually coming out
		// it might still be loading
		const onPlay = () => {
			setPlaying(true)
		}
		const onPause = () => {
			setPlaying(false)
		}

		const onMetadata = () => {
			// onDuration()
			// onTimeUpdate()
		}

		const onStalled = () => {
			_setLoading(true)
		}

		const onUnStalled = () => {
			_setLoading(false)
		}

		// onPlaying / onWaiting reflect the actual status of the audio
		// `onPlaying` is emitted when audio comes out of the speaker
		// `onWaiting` is emitted when audio is interrupted for buffering reasons
		let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null
		const onPlaying = () => {
			if (loadingTimeoutId) {
				clearTimeout(loadingTimeoutId)
			}
			loadingTimeoutId = null
			_setLoading(false)
		}
		const onWaiting = () => {
			if (!loadingTimeoutId) {
				loadingTimeoutId = setTimeout(() => {
					loadingTimeoutId = null
					_setLoading(true)
				}, 1000) // TODO: why wait 1s? I don't remember why I wrote this
			}
		}

		const onEnded = () => {
			setPlaying(false)
		}

		// watch for "src" attribute change
		const observer = new MutationObserver(() => {
			const {src} = element
			if (src !== currentSrc) {
				currentSrc = src
				currentPlayedSectionStart = 0
				setTotalSeconds(0)
				setSeconds(0)
				setPlayedSeconds(0)
				_setLoading(true)
				// element.play()
			}
		})
		observer.observe(element, {
			attributes: true,
			attributeFilter: ['src']
		})

		const controller = new AbortController()
		element.addEventListener('durationchange', onDuration, {signal: controller.signal})
		element.addEventListener('timeupdate', onTimeUpdate, {signal: controller.signal})
		element.addEventListener('play', onPlay, {signal: controller.signal})
		element.addEventListener('ended', onEnded, {signal: controller.signal})
		element.addEventListener('pause', onPause, {signal: controller.signal})
		element.addEventListener('loadedmetadata', onMetadata, {signal: controller.signal})
		element.addEventListener('stalled', onStalled, {signal: controller.signal})
		element.addEventListener('waiting', onWaiting, {signal: controller.signal})
		element.addEventListener('playing', onPlaying, {signal: controller.signal})
		element.addEventListener('seeking', onStalled, {signal: controller.signal})
		element.addEventListener('seeked', onUnStalled, {signal: controller.signal})

		return () => {
			observer.disconnect()
			controller.abort()
		}
	}, [audio])

	/**
	 * Acquire WakeLockSentinel to prevent audio from stopping after 1 track when phone screen is locked
	 * If this isn't enough and playlists keep getting stopped at the end of a track, the
	 * next thing to try would be to handle the "change src, call .play()" right inside the `ended` event
	 * listener, and not rely on a React render to propagate the new src
	 */
	const wakeLockSentinel = useRef<Promise<WakeLockSentinel> | null>(null)
	useEffect(() => {
		if (playing && !wakeLockSentinel.current) {
			// lock can only be acquired if page is visible
			if (document.visibilityState === 'visible') {
				wakeLockSentinel.current = navigator.wakeLock.request("screen")
				return
			} else {
				const controller = new AbortController()
				document.addEventListener("visibilitychange", () => {
					if (document.visibilityState === 'visible') {
						wakeLockSentinel.current = navigator.wakeLock.request("screen")
						controller.abort()
					}
				}, {signal: controller.signal})
				return () => controller.abort()
			}
		}
		if (!wakeLockSentinel.current) {
			return
		}
		// release lock after 15 minutes without playing, because it seems like the neighborly thing to do
		const timeoutId = setTimeout(async () => {
			const lock = await wakeLockSentinel.current
			lock?.release()
			wakeLockSentinel.current = null
		}, 1000 * 15)
		return () => clearTimeout(timeoutId)
	}, [playing])

	const progress = Boolean(seconds && totalSeconds) 
		? seconds / totalSeconds
		: 0

	return {
		playing,
		loading,
		displayCurrentTime,
		displayTotalTime,
		displayRemainingTime,
		seconds,
		totalSeconds,
		remainingSeconds,
		playedSeconds,
		progress,
	}
}