import { RefObject, useEffect, useRef, useState } from "react";

export default function useDisplayAndShow(open: boolean, ref: RefObject<HTMLElement>) {
	const [display, setDisplay] = useState(open)
	const [show, setShow] = useState(open)
	const initial = useRef(true)

	// toggle
	useEffect(() => {
		if (initial.current) {
			return
		}
		if (open) {
			setDisplay(true)
		} else {
			setShow(false)
		}
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
		// return () => {
		// 	cancelAnimationFrame(rafId)
		// }
	}, [display])

	// display after show
	useEffect(() => {
		if (initial.current || show || !ref.current) {
			return
		}
		const controller = new AbortController()
		ref.current.addEventListener("transitionend", () => {
			if (ref.current) {
				setDisplay(false)
			}
		} , {once: true, signal: controller.signal})
		return () => {
			controller.abort()
		}
	}, [show, ref])

	useEffect(() => {
		initial.current = false
	}, [])

	return { display, show }
}