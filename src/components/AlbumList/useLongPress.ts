import { type RefObject, useRef, useEffect } from "react"
import getTouchFromId from "utils/getTouchFromId"

const LONG_PRESS_DURATION = 1_000

export default function useLongPress({
	onLong: _onLong,
	item,
}: {
	onLong?: () => void
	item: RefObject<HTMLElement>
}) {
	const onLong = useRef(_onLong)
	onLong.current = _onLong

	useEffect(() => {
		if (!onLong.current) return
		const element = item.current
		if (!element) return

		const controller = new AbortController()
		let uxController: AbortController | null = null
		let timeout: ReturnType<typeof setTimeout> | null = null

		function start(touch: Touch) {
			uxController = new AbortController()

			const end = () => {
				if (timeout) {
					clearTimeout(timeout)
					timeout = null
				}
				if (uxController) {
					uxController.abort()
					uxController = null
				}
			}

			const cancel = (event: TouchEvent) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (!match) return
				end()
			}

			timeout = setTimeout(() => {
				timeout = null
				onLong.current?.()
				end()
			}, LONG_PRESS_DURATION)

			window.addEventListener("contextmenu", (event) => {
				event.preventDefault()
			}, { signal: uxController.signal })

			window.addEventListener("touchmove", cancel, { signal: uxController.signal })
			window.addEventListener("touchend", cancel, { signal: uxController.signal })
		}

		element.addEventListener("touchstart", (event) => {
			if (timeout !== null) return
			start(event.changedTouches.item(0) as Touch)
		}, { signal: controller.signal })

		return () => {
			controller.abort()
			if (uxController) uxController.abort()
			if (timeout) clearTimeout(timeout)
		}
	}, [item])
}