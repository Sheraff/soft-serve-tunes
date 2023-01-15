import { type editOverlay } from "components/AppContext/editOverlay"
import DeleteIcon from "icons/delete.svg"
import { useEffect, useRef } from "react"
import getTouchFromId from "utils/getTouchFromId"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

const DELETE_TIMEOUT = 2_000

export default function Delete({
	type,
	ids,
	onDone,
}: {
	type: ReturnType<typeof editOverlay["getValue"]>["type"]
	ids: string[]
	onDone: () => void
}) {
	const button = useRef<HTMLButtonElement>(null)

	const deleteTrack = trpc.edit.track.delete.useMutation({retry: 0})
	const deleteAlbum = trpc.edit.album.delete.useMutation({retry: 0})
	const deleteArtist = trpc.edit.artist.delete.useMutation({retry: 0})
	const deleteGenre = trpc.edit.genre.delete.useMutation({retry: 0})
	const deletePlaylist = trpc.playlist.delete.useMutation({retry: 0})

	const mutate = type === "track"
		? deleteTrack.mutateAsync
		: type === "album"
		? deleteAlbum.mutateAsync
		: type === "playlist"
		? deletePlaylist.mutateAsync
		: type === "artist"
		? deleteArtist.mutateAsync
		: type === "genre"
		? deleteGenre.mutateAsync
		: (() => {throw new Error(`No delete mutation for type ${type}`)})()

	useEffect(() => {
		const element = button.current
		if (!element) return
		const controller = new AbortController()
		const {signal} = controller

		let isPressing = false
		let end: (() => void) | null = null

		function post() {
			if (!element) return
			element.classList.add(styles.fall)
			navigator.vibrate(1)

			const transition = new Promise<void>(resolve =>
				element.addEventListener("transitionend", () => {resolve()}, {once: true})
			)
			const deletion = new Promise<void>(async (resolve) => {
				for (const id of ids) {
					try {
						await mutate({id})
					} catch (error) {
						console.error(error)
					}
				}
				resolve()
			})
			if (onDone) {
				Promise.all([transition, deletion]).then(onDone)
			}
		}

		function start(touch: Touch) {
			const controller = new AbortController()
			const {signal} = controller
			isPressing = true

			let rafId: number | null = null

			const _end = () => {
				if (rafId) cancelAnimationFrame(rafId)
				isPressing = false
				controller.abort()
				navigator.vibrate(0)
			}
			end = _end

			navigator.vibrate(new Array(DELETE_TIMEOUT/200).fill(200))
			void function loop(start?: DOMHighResTimeStamp, time?: DOMHighResTimeStamp) {
				if (signal.aborted) return
				rafId = requestAnimationFrame((time) => loop(start ?? time, time))
				if (!start || !time) return
				const progress = (time - start) / DELETE_TIMEOUT
				element!.style.setProperty("--progress", `${progress}`)
				if (progress >= 1) {
					_end()
					post()
				}
			}()

			element!.addEventListener("contextmenu", (event) => {
				event.preventDefault()
			}, {signal})

			const onTouchEnd = (event: TouchEvent) => {
				const match = getTouchFromId(event.changedTouches, touch.identifier)
				if (match) {
					_end()
					element!.style.removeProperty("--progress")
				}
			}

			window.addEventListener("touchend", onTouchEnd, {signal, passive: true})
			window.addEventListener("touchcancel", onTouchEnd, {signal, passive: true})
		}

		element.addEventListener("touchstart", (event) => {
			if (!isPressing) {
				const touch = event.changedTouches.item(0) as Touch
				start(touch)
			}
		}, {signal, passive: true})

		return () => {
			controller.abort()
			if (end) end()
		}
	}, [ids, onDone, mutate])
	return (
		<button type="button" className={styles.main} ref={button}>
			<div className={styles.button}>
				<DeleteIcon className={styles.icon} />
				Hold to delete
			</div>
		</button>
	)
}