import { RefObject, useEffect, useRef } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

function getTouchFromId(list: TouchList, id: number) {
	for (let i = 0; i < list.length; i++) {
		const item = list.item(i)
		if(item?.identifier === id)
			return item
	}
}

export default function useSlideTrack(
	ref: RefObject<HTMLDivElement>,
	{
		id,
		favorite,
	}: {
		id: string,
		favorite?: boolean
	}
) {
	const {mutate: likeMutation} = trpc.useMutation(["track.like"])

	const data = useRef({id, favorite})
	data.current.id = id
	data.current.favorite = favorite

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
			element.classList.add(styles['like-anim'] as string)

			element.addEventListener('animationend', () => {
				element.style.removeProperty('--x')
				element.classList.remove(styles['like-anim'] as string)
				element.classList.toggle(styles.liked as string)
				element.classList.remove(styles.will as string)
				controller.abort()
				animController = null
				likeMutation({
					id: data.current.id,
					toggle: !data.current.favorite,
				})
			}, {signal, once: true})
		}
		
		function reset() {
			if (!element) return
			const controller = new AbortController()
			const {signal} = controller
			animController = controller
			element.classList.add(styles['reset-anim'] as string)

			element.addEventListener('animationend', () => {
				element.style.removeProperty('--x')
				element.classList.remove(styles['reset-anim'] as string)
				element.classList.remove(styles.will as string)
				controller.abort()
				animController = null
			}, {signal, once: true})
		}

		function start(touch: Touch) {
			if (!touch || !element) return
			const controller = new AbortController()
			const {signal} = controller
			uxController = controller
			isDragging = true
			let capture = false

			const end = () => {
				controller.abort()
				uxController = null
				isDragging = false
			}

			window.addEventListener('touchmove', (event) => {
				if (!event.cancelable) {
					return end()
				}
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				const dx = match.clientX - touch.clientX
				if (!capture) {
					const dy = match.clientY - touch.clientY
					if (Math.abs(dx) > Math.abs(dy)) {
						capture = true
					} else {
						return end()
					}
					element.classList.add(styles.will as string)
				}
				event.preventDefault()
				const r = Math.abs(dx) / 48
				const total = Math.sign(dx) * (Math.atan(r - 0.25) + 0.25 + r * 0.07) * 48
				element.style.setProperty('--x', `${total}px`)
			}, {signal, capture: true, passive: false})

			window.addEventListener('touchend', (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				
				end()
				if (!capture) return

				const dx = match.clientX - touch.clientX
				if (dx < -48) {
					like()
				} else if (dx > 48) {
					// TODO: add to "play next"
					reset()
				} else {
					reset()
				}
			}, {signal, passive: false})
		}

		element.addEventListener('touchstart', (event) => {
			if (!isDragging) {
				const touch = event.changedTouches.item(0) as Touch
				start(touch)
			}
		}, {signal, passive: true})

		return () => {
			controller.abort()
			if (uxController) uxController.abort()
			if (animController) animController.abort()
		}
	}, [ref, likeMutation])

}