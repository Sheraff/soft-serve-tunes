import classNames from "classnames"
import { useEffect, useState, useRef, useCallback, RefObject, CSSProperties } from "react"
import Loading from "./loading.svg"
import styles from "./index.module.css"

export default function ProgressInput ({
	className,
	audio,
	progress: parentProgress = 0,
	canSetTime = false,
	loading = false,
	small = false,
}: {
	className?: string
	audio: RefObject<HTMLAudioElement>
	progress?: number // [0 - 100] progress of <audio>
	canSetTime?: boolean // sometimes <audio> cannot be given a currentTime
	loading: boolean
	small?: boolean
}) {
	const parentProgressRef = useRef(parentProgress)
	useEffect(() => {
		parentProgressRef.current = parentProgress
	}, [parentProgress])

	const input = useRef<HTMLInputElement>(null) // <input type=range> control of progress
	const [bindInputToPlayer, setBindInputToPlayer] = useState(true) // whether <input> updates based on <audio> or user input
	const [progress, setProgress] = useState(0)
	const paramsToAllowParentProgressAfterUserInput = useRef<{ src: string, min: number | null, max: number | null } | null>(null)

	const setProgressLogic = useCallback((value: number) => {
		if (!audio.current) return

		const allowProgress = () => {
			setProgress(value)
			paramsToAllowParentProgressAfterUserInput.current = null
		}

		if (!paramsToAllowParentProgressAfterUserInput.current) {
			allowProgress()
			return
		}

		const { min, max, src } = paramsToAllowParentProgressAfterUserInput.current

		if (audio.current.src !== src) { // source has changed
			allowProgress()
		} else if (min !== null) { // user went ahead, audio followed
			if (value > min) {
				allowProgress()
			}
		} else if (max !== null) { // user went back, audio followed
			if (value < max + 0.01) { // 1% margin just in case of slow JS, because audio progress moves forward, when going back to a specific value we might never have time to read said value
				allowProgress()
			}
		}
	}, [audio])

	useEffect(() => {
		if (!input.current) return
		if (bindInputToPlayer) {
			setProgressLogic(parentProgress)
			input.current.value = String(parentProgress * 100)
		}
	}, [bindInputToPlayer, parentProgress, setProgressLogic])

	useEffect(() => {
		if (!canSetTime) {
			paramsToAllowParentProgressAfterUserInput.current = null
			setBindInputToPlayer(true)
			return
		}

		if (!audio.current || !input.current) return
		const inputElement = input.current
		const audioElement = audio.current


		const vibrateOnInput = (prev: number, curr: number) => {
			const prevChunk = Math.floor(prev / 30)
			const newChunk = Math.floor(curr / 30)
			if (prevChunk !== newChunk) {
				navigator.vibrate(1)
			}
		}

		const onInput = () => {
			const value = Number(inputElement.value) / 100
			paramsToAllowParentProgressAfterUserInput.current = {
				src: audioElement.src,
				min: null,
				max: null,
			}
			const currentTime = value * audioElement.duration
			if (Number.isFinite(currentTime)) {
				vibrateOnInput(audioElement.currentTime, currentTime)
				audioElement.currentTime = currentTime
			}
			if (parentProgressRef.current < value) {
				paramsToAllowParentProgressAfterUserInput.current.min = value
			} else {
				paramsToAllowParentProgressAfterUserInput.current.max = value
			}
			setProgress(value)
		}

		const onInputStart = () => {
			paramsToAllowParentProgressAfterUserInput.current = {
				src: audioElement.src,
				min: null,
				max: null,
			}
			setBindInputToPlayer(false)
		}

		let timeoutId: ReturnType<typeof setTimeout> | null = null
		const onInputEnd = () => {
			if (!timeoutId) {
				timeoutId = setTimeout(() => {
					timeoutId = null
					setBindInputToPlayer(true)
				}, 200)
			}
			if (document.activeElement === inputElement) {
				inputElement.blur()
			}
		}

		const controller = new AbortController()
		inputElement.addEventListener("input", onInput, { signal: controller.signal })
		inputElement.addEventListener("pointerdown", onInputStart, { signal: controller.signal })
		inputElement.addEventListener("pointercancel", onInputEnd, { signal: controller.signal })
		inputElement.addEventListener("pointerleave", onInputEnd, { signal: controller.signal })
		inputElement.addEventListener("pointerout", onInputEnd, { signal: controller.signal })
		document.addEventListener("pointerup", onInputEnd, { signal: controller.signal })
		return () => {
			controller.abort()
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	}, [canSetTime, audio])

	return (
		<div
			className={classNames(className, styles.main, {
				[styles.user]: !bindInputToPlayer,
				[styles.disabled]: !canSetTime,
				[styles.loading]: loading,
				[styles.small]: small,
			})}
			style={{ "--progress": progress } as CSSProperties}
		>
			<input
				ref={input}
				type="range"
				min="0"
				max="100"
				step="any"
			/>
			<div className={styles.progress} />
			<div className={styles.thumb}>
				{loading && <Loading className={styles.loader} />}
			</div>
		</div>
	)
}
