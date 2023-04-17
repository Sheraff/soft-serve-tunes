import { MutableRefObject, RefObject, useEffect } from "react"
import getTouchFromId from "utils/getTouchFromId"
import styles from "./index.module.css"

function scrollParent (node: HTMLElement): HTMLElement {
	if (node.scrollHeight > node.clientHeight) {
		return node
	} else if (node.parentElement === document.documentElement) {
		return node.parentElement
	}
	return scrollParent(node.parentElement!)
}

function iterateSiblings (
	node: HTMLElement,
	offset: number,
	callback: (node: HTMLElement, inRange: boolean) => void
) {
	const referenceIndex = Number(node.dataset.index)
	const extremumIndex = referenceIndex + offset
	const firstIndex = Math.min(referenceIndex, extremumIndex)
	const lastIndex = Math.max(referenceIndex, extremumIndex)
	let sibling: HTMLElement | null = node.parentElement!.firstElementChild as HTMLElement
	do {
		if (sibling !== node) {
			const index = Number(sibling.dataset.index)
			const isInRange = index >= firstIndex && index <= lastIndex
			callback(sibling, isInRange)
		}
	} while ((sibling = sibling.nextElementSibling as HTMLElement | null))
}

export type Callbacks = {
	onDrop: (from: number, to: number) => void
}

export default function useDragTrack<T extends boolean> (
	ref: RefObject<HTMLElement>,
	enabled: T,
	callbacks: T extends true ? { current: Callbacks } : { current?: Partial<Callbacks> },
	count: number,
	forceInsertVirtualDragItem?: MutableRefObject<number | null>,
) {
	useEffect(() => {
		if (!enabled) return
		const element = ref.current
		if (!element) return
		const controller = new AbortController()
		const { signal } = controller

		let isDragging = false
		let uxController: AbortController | null = null
		let scrollRafId: number | null = null
		let touchRafId: number | null = null

		function start (touch: Touch | null, item: HTMLElement | null) {
			if (!touch || !item) return
			const controller = new AbortController()
			const { signal } = controller
			uxController = controller
			isDragging = true
			let itemsOffset = 0
			let scrollSpeed = 0
			let dy = 0

			const scrollContainer = scrollParent(item)
			const initialScroll = scrollContainer.scrollTop
			const itemHeight = item.offsetHeight
			const itemIndex = Number(item.dataset.index)
			if (forceInsertVirtualDragItem) {
				forceInsertVirtualDragItem.current = itemIndex
			}

			item.classList.add(styles.drag)

			window.addEventListener("contextmenu", (event) => {
				event.preventDefault()
			}, { signal })

			function scrollFrame (lastTime?: number) {
				scrollRafId = requestAnimationFrame((time) => {
					scrollFrame(time)

					// scroll parent
					if (lastTime) {
						scrollContainer.scrollTop += scrollSpeed * (time - lastTime) / 1
					}

					// compute distance traveled
					const totalOffset = dy + scrollContainer.scrollTop - initialScroll
					item!.style.setProperty("--y", `${totalOffset}px`)

					// move siblings
					const currentItemsOffset = totalOffset > 0
						? Math.floor(totalOffset / itemHeight + 0.5)
						: Math.ceil(totalOffset / itemHeight - 0.5)
					const clampedItemsOffset = Math.min(count - itemIndex - 1, Math.max(-itemIndex, currentItemsOffset))
					if (itemsOffset !== clampedItemsOffset) {
						navigator.vibrate(1)
						itemsOffset = clampedItemsOffset
						iterateSiblings(item!, itemsOffset, (sibling, inRange) => (
							sibling.classList.toggle(styles.slide, inRange)
						))
						item!.style.setProperty("--bg-y", `${itemsOffset}`)
					}
				})
			}
			scrollFrame()

			window.addEventListener("touchmove", (event) => {
				if (touchRafId) cancelAnimationFrame(touchRafId)
				touchRafId = requestAnimationFrame(() => {
					touchRafId = null
					const match = getTouchFromId(event.changedTouches, touch.identifier)
					if (!match) return

					// move item
					dy = match.clientY - touch.clientY

					// scroll parent
					scrollSpeed = match.clientY < innerHeight / 3
						? (match.clientY - innerHeight / 3) / (innerHeight / 3)
						: match.clientY > innerHeight * 3 / 4
							? (match.clientY - innerHeight * 3 / 4) / (innerHeight / 4)
							: 0
				})
			}, { signal, passive: true })

			const onEnd = () => {
				item.classList.remove(styles.drag)
				item.style.removeProperty("--y")
				item.style.removeProperty("--bg-y")
				controller.abort()
				uxController = null
				isDragging = false
				if (forceInsertVirtualDragItem) {
					forceInsertVirtualDragItem.current = null
				}
				if (scrollRafId) {
					cancelAnimationFrame(scrollRafId)
					scrollRafId = null
				}
				if (touchRafId) {
					cancelAnimationFrame(touchRafId)
					touchRafId = null
				}
				const siblings = item.parentElement!.children
				for (let i = 0; i < siblings.length; i++) {
					const sibling = siblings.item(i) as HTMLElement
					sibling.classList.remove(styles.slide)
				}
			}

			window.addEventListener("touchend", (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				onEnd()
				callbacks.current!.onDrop!(itemIndex, itemIndex + itemsOffset)
			}, { signal, passive: false })

			window.addEventListener("touchcancel", (event) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				onEnd()
			}, { signal, passive: false })
		}

		element.addEventListener("touchstart", (event) => {
			const target = event.target as HTMLElement
			if (!target.dataset.handle) return

			if (!isDragging) {
				event.preventDefault()
				event.stopPropagation()
				const touch = event.changedTouches.item(0)
				const item = target.closest(`.${styles.item}`) as HTMLElement | null
				navigator.vibrate(1)
				start(touch, item)
			}
		}, { signal, capture: true })

		return () => {
			controller.abort()
			if (forceInsertVirtualDragItem) forceInsertVirtualDragItem.current = null
			if (uxController) uxController.abort()
			if (scrollRafId) cancelAnimationFrame(scrollRafId)
			if (touchRafId) cancelAnimationFrame(touchRafId)
		}
	}, [ref, enabled, callbacks, count, forceInsertVirtualDragItem])

}