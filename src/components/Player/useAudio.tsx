import { RefObject, useEffect, useMemo, useState } from "react"
import { trpc } from "utils/trpc"

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
		.map((num) => num.toString().padStart(2, "0"))
		.join(":")
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
	const remainingSeconds = totalSeconds - seconds
	
	const [displayCurrentTime, displayTotalTime, displayRemainingTime] = useMemo(() => {
		const currentTimeVector = secondsToTimeVector(seconds)
		const totalTimeVector = secondsToTimeVector(totalSeconds)
		const remainingTimeVector = secondsToTimeVector(remainingSeconds)
		return pairOfTimeVectorsToPairOfDisplayStrings([currentTimeVector, totalTimeVector, remainingTimeVector])
	}, [seconds, totalSeconds, remainingSeconds])
	
	const {mutate} = trpc.track.playcount.useMutation()

	useEffect(() => {
		const element = audio.current
		if (!element) return

		let currentSrc: string
		let currentPlayedSectionStart: number
		let currentId: string | undefined

		let visible = true
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") {
				visible = false
			} else {
				visible = true
				setPlaying(playing)
				setLoading(loading)
				setTotalSeconds(totalSeconds)
				setSeconds(seconds)
			}
		}

		let playedSeconds = 0
		let consideredPlayed = false
		const _setPlayedSeconds = (s: number) => {
			playedSeconds = s
			const newConsideredPlayed = Boolean(playedSeconds > 45 || (totalSeconds && playedSeconds / totalSeconds > 0.4))
			if (!consideredPlayed && newConsideredPlayed && currentId) {
				mutate({id: currentId})
			}
			consideredPlayed = newConsideredPlayed
		}

		let playing = false
		const _setPlaying = (p: boolean) => {
			playing = p
			if (visible) {
				setPlaying(p)
			}
		}
		
		let loading = true
		const _setLoading = (l: boolean) => {
			loading = l
			if (visible) {
				setLoading(l)
			}
		}

		let totalSeconds = 0
		const _setTotalSeconds = (s: number) => {
			totalSeconds = s
			if (visible) {
				setTotalSeconds(s)
			}
		}

		let seconds = 0
		const _setSeconds = (s: number) => {
			seconds = s
			if (visible) {
				setSeconds(s)
			}
		}

		const onDuration = () => {
			const {duration, src} = element
			if (!Number.isNaN(duration) && (src === currentSrc)) {
				_setTotalSeconds(duration)
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
				_setSeconds(currentTime)
				if (!loading) {
					const delta = currentTime - currentPlayedSectionStart
					_setPlayedSeconds(playedSeconds + delta)
				}
				currentPlayedSectionStart = currentTime
			}
		}

		// onPlay / onPause reflect the intention of the user, but `onPlay` doesn't mean audio is actually coming out
		// it might still be loading
		const onPlay = () => {
			_setPlaying(true)
		}
		const onPause = () => {
			_setPlaying(false)
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
				}, 1000) // TODO: why wait 1s? I don't remember why I wrote this (I think it was to avoid flickering a "wait" state every time there is a mini loading interruption)
			}
		}

		const onEnded = () => {
			_setPlaying(false)
		}

		// watch for "src" attribute change
		const observer = new MutationObserver(() => {
			const {src} = element
			if (src !== currentSrc) {
				currentSrc = src
				currentPlayedSectionStart = 0
				_setTotalSeconds(0)
				_setSeconds(0)
				_setLoading(true)
				_setPlayedSeconds(0)
				currentId = src.split("/api/file/")[1]
			}
		})
		observer.observe(element, {
			attributes: true,
			attributeFilter: ["src"]
		})

		const controller = new AbortController()
		element.addEventListener("durationchange", onDuration, {signal: controller.signal})
		element.addEventListener("timeupdate", onTimeUpdate, {signal: controller.signal})
		element.addEventListener("play", onPlay, {signal: controller.signal})
		element.addEventListener("ended", onEnded, {signal: controller.signal})
		element.addEventListener("pause", onPause, {signal: controller.signal})
		element.addEventListener("stalled", onStalled, {signal: controller.signal})
		element.addEventListener("waiting", onWaiting, {signal: controller.signal})
		element.addEventListener("playing", onPlaying, {signal: controller.signal})
		element.addEventListener("seeking", onStalled, {signal: controller.signal})
		element.addEventListener("seeked", onUnStalled, {signal: controller.signal})
		document.addEventListener("visibilitychange", onVisibilityChange, {signal: controller.signal})

		return () => {
			observer.disconnect()
			controller.abort()
		}
	}, [audio, mutate])

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
		progress,
	}
}