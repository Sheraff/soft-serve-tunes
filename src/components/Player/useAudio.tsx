import { RefObject, useEffect, useMemo, useState } from "react"

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
			}
		}

		const onTimeUpdate = () => {
			const {currentTime, src} = element
			if (!Number.isNaN(currentTime) && (src === currentSrc)) {
				setSeconds(currentTime)
				onDuration() // TODO: shouldn't have to be called every time
				if (!loading) {
					const delta = currentTime - currentPlayedSectionStart
					setPlayedSeconds(prev => prev + delta)
				}
				currentPlayedSectionStart = currentTime
			}
		}

		const onPlay = () => {
			setPlaying(true)
		}

		const onLoad = () => {
			onDuration()
			onTimeUpdate()
		}

		const onPause = () => {
			setPlaying(false)
		}

		const onStalled = () => {
			_setLoading(true)
		}

		const onUnStalled = () => {
			_setLoading(false)
		}

		let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null

		const onWaiting = () => {
			if (!loadingTimeoutId) {
				loadingTimeoutId = setTimeout(() => {
					loadingTimeoutId = null
					_setLoading(true)
				}, 1000) // TODO: why wait 1s? I don't remember why I wrote this
			}
		}

		const onPlaying = () => {
			if (loadingTimeoutId) {
				clearTimeout(loadingTimeoutId)
			}
			loadingTimeoutId = null
			_setLoading(false)
		}

		const onEnded = () => {
			setPlaying(false)
		}

		const observer = new MutationObserver(() => {
			const {src} = element
			if (src !== currentSrc) {
				currentSrc = src
				currentPlayedSectionStart = 0
				setTotalSeconds(0)
				setSeconds(0)
				setPlayedSeconds(0)
				_setLoading(true)
				element.play()
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
		element.addEventListener('loadedmetadata', onLoad, {signal: controller.signal})
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