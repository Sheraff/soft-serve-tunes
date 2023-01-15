import { type RefObject, startTransition, useEffect, useRef, useState } from "react"

export default function useDisplayAndShow(
	open: "open" | "close" | "force-open" | "force-close" | boolean,
	ref: RefObject<HTMLElement>,
	onDone?: (open: "open" | "close" | "force-open" | "force-close") => void
) {
	const _open = open === true ? "open" : open === false ? "close" : open
	const internalOnDone = useRef(onDone)
	internalOnDone.current = onDone

	const [display, setDisplay] = useState(_open === "force-open" || _open === "open")
	const [show, setShow] = useState(_open === "force-open")

	// toggle
	useEffect(() => {
		startTransition(() => {
			if (_open === "force-open") {
				if (!display || !show) {
					setDisplay(true)
					setShow(true)
				}
			} else if (_open === "force-close") {
				if (display || show) {
					setShow(false)
					setDisplay(false)
				}
			} else if (_open === "open") {
				if (!display) {
					setDisplay(true)
				}
			} else {
				if (show) {
					setShow(false)
				}
			}
		})
	}, [_open])

	// show after display=true
	useEffect(() => {
		if (!display || show) {
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
		if (show || !ref.current) {
			return
		}
		if (_open === "force-close" || !display) {
			internalOnDone.current?.("force-close")
			return
		}
		const controller = new AbortController()
		const afterTransition = () => {
			if (ref.current) {
				startTransition(() => {
					setDisplay(false)
					internalOnDone.current?.("close")
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
		if (!show || !ref.current || !internalOnDone.current) {
			return
		}
		if (_open === "force-open") {
			internalOnDone.current?.("force-open")
			return
		}
		const controller = new AbortController()
		const afterTransition = () => {
			if (ref.current) {
				startTransition(() => {
					internalOnDone.current?.("open")
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

	return { display, show }
}