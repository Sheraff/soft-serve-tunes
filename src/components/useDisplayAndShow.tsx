import { RefObject, startTransition, useEffect, useRef, useState } from "react"

export default function useDisplayAndShow(
	open: boolean,
	ref: RefObject<HTMLElement>,
	onDone?: () => void
) {
	const [display, setDisplay] = useState(open)
	const [show, setShow] = useState(open)
	const initial = useRef(true)

	// toggle
	useEffect(() => {
		if (initial.current) {
			return
		}
		startTransition(() => {
			if (open) {
				setDisplay(true)
			} else {
				setShow(false)
			}
		})
	}, [open])

	// show after display
	useEffect(() => {
		if (initial.current || !display) {
			return
		}
		let rafId = requestAnimationFrame(() => {
			rafId = requestAnimationFrame(() => {
				setShow(true)
			})
		})
		return () => {
			cancelAnimationFrame(rafId)
		}
	}, [display])

	// display after show=false
	useEffect(() => {
		if (initial.current || show || !ref.current) {
			return
		}
		const controller = new AbortController()
		const afterTransition = () => {
			if (ref.current) {
				startTransition(() => {
					setDisplay(false)
				})
			}
			controller.abort()
		}
		ref.current.addEventListener("transitionend", afterTransition , {once: true, signal: controller.signal})
		ref.current.addEventListener("animationend", afterTransition , {once: true, signal: controller.signal})
		return () => {
			controller.abort()
		}
	}, [show, ref])
	
	// handle `done` after show=true
	useEffect(() => {
		if (initial.current || !show || !ref.current || !onDone) {
			return
		}
		const controller = new AbortController()
		const afterTransition = () => {
			if (ref.current) {
				startTransition(() => {
					onDone()
				})
			}
			controller.abort()
		}
		ref.current.addEventListener("transitionend", afterTransition , {once: true, signal: controller.signal})
		ref.current.addEventListener("animationend", afterTransition , {once: true, signal: controller.signal})
		return () => {
			controller.abort()
		}
	}, [show, ref, onDone])

	useEffect(() => {
		initial.current = false
	}, [])

	return { display, show }
}