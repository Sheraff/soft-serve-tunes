import { type RefObject, startTransition, useEffect, useRef, useState } from "react"

export default function useDisplayAndShow(
	open: "open" | "close" | "force-open" | "force-close",
	ref: RefObject<HTMLElement>,
	onDone?: (open: "open" | "close" | "force-open" | "force-close") => void
) {
	const internalOnDone = useRef(onDone)
	internalOnDone.current = onDone

	const [display, setDisplay] = useState(open === "force-open" || open === "open")
	const [show, setShow] = useState(open === "force-open")
	const initial = useRef(true)

	// toggle
	useEffect(() => {
		if (initial.current) {
			return
		}
		startTransition(() => {
			if (open === "force-open") {
				setDisplay(true)
				setShow(true)
			} else if (open === "force-close") {
				setShow(false)
				setDisplay(false)
			} else if (open) {
				setDisplay(true)
			} else {
				setShow(false)
			}
		})
	}, [open])

	// show after display=true
	useEffect(() => {
		if (initial.current || !display || show) {
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
		if (open === "force-close" || !display) {
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
		if (initial.current || !show || !ref.current || !internalOnDone.current) {
			return
		}
		if (open === "force-open") {
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

	useEffect(() => {
		initial.current = false
	}, [])

	return { display, show }
}