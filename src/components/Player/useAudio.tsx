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

function pairOfTimeVectorsToPairOfDisplayStrings(vec1: TimeVector, vec2: TimeVector): [string, string] {
	if (vec1[0] === 0 && vec2[0] === 0) {
		return [
			arrayToTimeDisplayString([vec1[1], vec1[2]]),
			arrayToTimeDisplayString([vec2[1], vec2[2]]),
		]
	}
	return [
		arrayToTimeDisplayString(vec1),
		arrayToTimeDisplayString(vec2),
	]
}

export default function useAudio(audio: RefObject<HTMLAudioElement>) {
	const [seconds, setSeconds] = useState(0) // current time
	const [totalSeconds, setTotalSeconds] = useState(0) // total time of source
	const [playing, setPlaying] = useState(false) // follows state of DOM node
	const [loading, setLoading] = useState(true)

	const [displayCurrentTime, displayTotalTime] = useMemo(() => {
		const currentTimeVector = secondsToTimeVector(seconds)
		const totalTimeVector = secondsToTimeVector(totalSeconds)
		return pairOfTimeVectorsToPairOfDisplayStrings(currentTimeVector, totalTimeVector)
	}, [seconds, totalSeconds])

	useEffect(() => {
		const element = audio.current
		if (!element) return

		let currentSrc: string

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
			}
		}

		const onPlay = () => {
			const {src} = element
			if (currentSrc !== src) {
				setTotalSeconds(0)
				setSeconds(0)
				currentSrc = src
			}
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
			setLoading(true)
		}

		let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null

		const onWaiting = () => {
			if (!loadingTimeoutId) {
				loadingTimeoutId = setTimeout(() => {
					loadingTimeoutId = null
					setLoading(true)
				}, 1000)
			}
		}

		const onPlaying = () => {
			if (loadingTimeoutId) {
				clearTimeout(loadingTimeoutId)
			}
			loadingTimeoutId = null
			setLoading(false)
		}

		const controller = new AbortController()
		element.addEventListener('durationchange', onDuration, {signal: controller.signal})
		element.addEventListener('timeupdate', onTimeUpdate, {signal: controller.signal})
		element.addEventListener('play', onPlay, {signal: controller.signal})
		element.addEventListener('pause', onPause, {signal: controller.signal})
		element.addEventListener('loadedmetadata', onLoad, {signal: controller.signal})
		element.addEventListener('stalled', onStalled, {signal: controller.signal})
		element.addEventListener('waiting', onWaiting, {signal: controller.signal})
		element.addEventListener('playing', onPlaying, {signal: controller.signal})

		return () => controller.abort()
	}, [audio])

	const progress = Boolean(seconds && totalSeconds) 
		? seconds / totalSeconds
		: 0

	return {
		playing,
		loading,
		displayCurrentTime,
		displayTotalTime,
		seconds,
		totalSeconds,
		progress,
	}
}