import { RefObject, useEffect } from "react"
import styles from "./index.module.css"

function getTouchFromId(list: TouchList, id: number) {
	for (let i = 0; i < list.length; i++) {
		const item = list.item(i)
		if(item?.identifier === id)
			return item
	}
}

const DELAYED_SWITCH_DURATION = 300
const LONG_PRESS_DURATION = 1_000

export type Callbacks = {
	onLike: () => void
	onAdd: () => void
	onNext: () => void
	onLong?: () => void
}

export default function useSlideTrack(
	ref: RefObject<HTMLDivElement>,
	callbacks: {current: Callbacks},
	opts: {
		quickSwipeDeleteAnim?: boolean
	} = {}
) {
	useEffect(() => {
		const element = ref.current
		if (!element) return
		const controller = new AbortController()
		const {signal} = controller
		let uxController: AbortController | null = null
		let animController: AbortController | null = null
		let switchController: AbortController | null = null
		let timeoutId: ReturnType<typeof setTimeout> | null = null
		let triggerSecondaryAction = false

		let isDragging = false

		function like() {
			if (!element) return
			const controller = new AbortController()
			const {signal} = controller
			animController = controller
			element.classList.add(styles['like-anim'] as string)
			navigator.vibrate(1)

			element.addEventListener('animationend', (e) => {
				if (e.animationName !== styles['like-slide'] && e.animationName !== styles['dislike-slide']) return
				element.style.removeProperty('--x')
				element.classList.remove(styles['like-anim'] as string)
				element.classList.remove(styles['switch-left'] as string)
				element.classList.toggle(styles.liked as string)
				element.classList.remove(styles.will as string)
				controller.abort()
				animController = null
				callbacks.current.onLike()
			}, {signal})
		}
		
		function reset() {
			if (!element) return
			const controller = new AbortController()
			const {signal} = controller
			animController = controller
			element.classList.add(styles['reset-anim'] as string)

			element.addEventListener('animationend', (e) => {
				if (e.animationName !== styles['reset-slide']) return
				element.style.removeProperty('--x')
				element.classList.remove(styles['reset-anim'] as string)
				element.classList.remove(styles['switch-left'] as string)
				element.classList.remove(styles.will as string)
				controller.abort()
				animController = null
			}, {signal})
		}

		function delayedSwitch(which: 'left' | 'right' = 'left', end: () => void) {
			if (!element) return

			triggerSecondaryAction = false

			if (which === 'right') return

			timeoutId = setTimeout(() => {
				timeoutId = null
				element.classList.add(styles['switch-left'] as string)
				const controller = new AbortController()
				const {signal} = controller
				switchController = controller
				element.addEventListener('animationend', (e) => {
					if (e.animationName !== styles['switch']) return
					triggerSecondaryAction = true
					controller.abort()
					switchController = null
					navigator.vibrate(1)
					end()
					playlist()
					callbacks.current.onAdd()
				}, {signal})
			}, DELAYED_SWITCH_DURATION)
		}

		function playlist() {
			if (!element) return
			const controller = new AbortController()
			const {signal} = controller
			animController = controller
			if (opts.quickSwipeDeleteAnim && !triggerSecondaryAction) {
				element.style.setProperty('--height', `${element.offsetHeight}px`)
				element.classList.add(styles['remove-anim'] as string)
			} else {
				element.classList.add(styles['add-anim'] as string)
			}
			navigator.vibrate(1)

			element.addEventListener('animationend', (e) => {
				if (e.animationName !== styles['add-anim-body'] && e.animationName !== styles['remove-anim-body']) return
				element.style.removeProperty('--x')
				element.classList.remove(styles['add-anim'] as string)
				// WARNING: not removing the "remove-anim" class only works if the quickSwipeAction callback deletes the item
				// element.classList.remove(styles['remove-anim'] as string)
				element.classList.remove(styles['switch-left'] as string)
				element.classList.remove(styles.will as string)
				controller.abort()
				animController = null
				if (!triggerSecondaryAction) {
					callbacks.current.onNext()
				}
			}, {signal})
		}

		function start(touch: Touch) {
			if (!touch || !element) return
			const controller = new AbortController()
			const {signal} = controller
			uxController = controller
			isDragging = true
			let capture = false
			let longPressTimeoutId: ReturnType<typeof setTimeout> | null = null

			const end = () => {
				if (timeoutId) {
					clearTimeout(timeoutId)
					timeoutId = null
				}
				if (longPressTimeoutId) {
					clearTimeout(longPressTimeoutId)
					longPressTimeoutId = null
				}
				controller.abort()
				uxController = null
				isDragging = false
			}

			if (callbacks.current.onLong) {
				longPressTimeoutId = setTimeout(() => {
					longPressTimeoutId = null
					if (callbacks.current.onLong) {
						end()
						callbacks.current.onLong()
					}
				}, LONG_PRESS_DURATION)

				window.addEventListener('contextmenu', (event) => {
					event.preventDefault()
				}, {signal})
			}

			window.addEventListener('touchmove', (event) => {
				if (longPressTimeoutId) {
					clearTimeout(longPressTimeoutId)
					longPressTimeoutId = null
				}
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				const dx = match.clientX - touch.clientX
				if (!capture) {
					const dy = match.clientY - touch.clientY
					if (dx === dy && dx === 0) {
						return
					}
					if (Math.abs(dx) > Math.abs(dy)) {
						capture = true
					} else {
						return end()
					}
					element.classList.add(styles.will as string)
				}
				const valid = dx > 48 || dx < -48
				if (valid && !timeoutId) {
					delayedSwitch(dx > 48 ? 'left' : 'right', end)
				}
				if (!valid && timeoutId) {
					clearTimeout(timeoutId)
					timeoutId = null
				}
				const r = Math.abs(dx) / 48
				const total = Math.sign(dx) * (Math.atan(r - 0.25) + 0.25 + r * 0.07) * 48
				element.style.setProperty('--x', `${total}px`)
			}, {signal})

			window.addEventListener('touchend', (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				
				end()
				if (!capture) return

				const dx = match.clientX - touch.clientX
				if (dx < -48) {
					like()
				} else if (dx > 48) {
					playlist()
				} else {
					reset()
				}
			}, {signal, passive: false})
		}

		element.addEventListener('touchstart', (event) => {
			if (!isDragging) {
				const touch = event.changedTouches.item(0) as Touch
				if (touch.clientX < 20 || touch.clientX > innerWidth - 20) {
					// avoid conflict with phone swipe global gestures
					return
				}
				start(touch)
			}
		}, {signal, passive: true})

		return () => {
			controller.abort()
			if (uxController) uxController.abort()
			if (animController) animController.abort()
			if (switchController) switchController.abort()
			if (timeoutId) clearTimeout(timeoutId)
		}
	}, [ref, callbacks, opts.quickSwipeDeleteAnim])

}