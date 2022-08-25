import { RefObject, useEffect } from "react"
import styles from "./index.module.css"

function getTouchFromId(list: TouchList, id: number) {
	for (let i = 0; i < list.length; i++) {
		const item = list.item(i)
		if(item?.identifier === id)
			return item
	}
}

export default function useSlideTrack(ref: RefObject<HTMLDivElement>) {

	useEffect(() => {
		const element = ref.current
		if (!element) return
		const controller = new AbortController()
		const {signal} = controller
		let uxController: AbortController | null = null
		let animController: AbortController | null = null

		let isDragging = false

		function like() {
			if (!element) return
			const controller = new AbortController()
			const {signal} = controller
			animController = controller
			element.classList.add(styles.animate as string)

			element.addEventListener('animationend', () => {
				element.style.removeProperty('--x')
				element.classList.remove(styles.animate as string)
				element.classList.toggle(styles.liked as string)
				controller.abort()
			}, {signal, once: true})
		}

		function start(touch: Touch) {
			if (!touch || !element) return
			const controller = new AbortController()
			const {signal} = controller
			uxController = controller
			isDragging = true
			let capture = false

			window.addEventListener('touchmove', (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				const dx = match.clientX - touch.clientX
				if (!capture) {
					const dy = match.clientY - touch.clientY
					if (Math.abs(dx) > Math.abs(dy)) {
						capture = true
					} else {
						return
					}
				}
				event.preventDefault()
				const clamp = Math.sign(dx) * Math.min(Math.abs(dx), 48)
				const spring = Math.sign(dx) * Math.log2(Math.max(Math.abs(dx) - 48, 1)) * 5
				element.style.setProperty('--x', `${clamp + spring}px`)
			}, {signal, capture: true, passive: false})

			window.addEventListener('touchend', (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				
				controller.abort()
				uxController = null
				isDragging = false
				if (!capture) return

				const dx = match.clientX - touch.clientX
				if (dx < -48) {
					like()
				} else if (dx > 48) {
					// add to "play next"
				} else {
					// return to normal
				}
			}, {signal, passive: false})
		}

		element.addEventListener('touchstart', (event) => {
			if (!isDragging) {
				const touch = event.changedTouches.item(0) as Touch
				start(touch)
			}
		}, {signal})

		return () => {
			controller.abort()
			if (uxController) uxController.abort()
			if (animController) animController.abort()
		}
	}, [ref])

}