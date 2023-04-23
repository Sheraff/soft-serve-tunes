import classNames from "classnames"
import { type Playlist, onPlaylistSaved } from "client/db/useMakePlaylist"
import { memo, startTransition, useRef, useState, type RefObject } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveIcon from "icons/library_add.svg"
import SavedIcon from "icons/library_remove.svg"
import { useQueryClient } from "@tanstack/react-query"

function useDeletePlaylist ({
	buttonRef,
	freeze,
	onBefore,
	onSuccess,
	onError,
}: {
	buttonRef: RefObject<HTMLButtonElement>
	freeze: (state: boolean | null) => void
	onBefore?: (type: Type) => void
	onSuccess?: (type: Type) => void
	onError?: (type: Type) => void
}) {
	const trpcClient = trpc.useContext()
	const { mutate: deletePlaylistMutation } = trpc.playlist.delete.useMutation()
	return (id: string) => {
		if (!id) {
			throw new Error("Trying to delete a playlist, but no ID provided")
		}
		if (onBefore) onBefore("delete")
		const button = buttonRef.current!
		button.classList.add(styles.delete)
		button.classList.remove(styles.reappear)
		const target = button.firstElementChild!
		freeze(true)
		let conditions = 0

		const intro = target.animate([
			{ transform: "rotate(0)" },
			{ transform: "rotate(65deg)" },
		], { duration: 300, iterations: 1, easing: "ease-in" })
		intro.finished.then(() => {
			target.animate([
				{ transform: "rotate(65deg)" },
				{ transform: "rotate(25deg)" },
			], { duration: 500, iterations: Infinity, easing: "ease-in-out", direction: "alternate" })
		})
		setTimeout(() => {
			conditions++
			onEnd()
		}, 2_300)
		const onEnd = () => {
			if (conditions < 2) return
			const animation = target.animate([
				{ transform: "translateY(0)", opacity: 1 },
				{ transform: "translateY(40vh)", opacity: 0 },
			], { duration: 600, iterations: 1, easing: "ease-in", composite: "add" })
			animation.finished.then(() => {
				target.getAnimations().forEach(anim => anim.cancel())
				button.classList.remove(styles.delete)
				button.classList.add(styles.reappear)
				freeze(null)
				if (onSuccess) onSuccess("delete")
			})
		}
		startTransition(() => {
			deletePlaylistMutation({ id }, {
				onSuccess () {
					trpcClient.playlist.get.setData({ id }, null)
					onPlaylistSaved(null, null)
					conditions++
					onEnd()
				},
				onError () {
					target.getAnimations().forEach(anim => anim.cancel())
					button.classList.remove(styles.delete)
					freeze(null)
					if (onError) onError("delete")
				},
			})
		})
	}
}

function useSavePlaylist ({
	buttonRef,
	freeze,
	onBefore,
	onSuccess,
	onError,
}: {
	buttonRef: RefObject<HTMLButtonElement>
	freeze: (state: boolean | null) => void
	onBefore?: (type: Type) => void
	onSuccess?: (type: Type) => void
	onError?: (type: Type) => void
}) {
	const trpcClient = trpc.useContext()
	const queryClient = useQueryClient()
	const { mutate: savePlaylistMutation } = trpc.playlist.save.useMutation()
	return () => {
		if (onBefore) onBefore("save")
		const button = buttonRef.current!
		button.classList.add(styles.save)
		button.classList.remove(styles.reappear)
		const target = button.firstElementChild!
		freeze(false)
		let conditions = 0

		const intro = target.animate([
			{ transform: "scale(1) rotateY(0)" },
			{ transform: "scale(1.5) rotateY(1turn)" },
		], { duration: 600, iterations: 1, easing: "ease-in" })
		intro.finished.then(() => {
			target.animate([
				{ transform: "scale(1.5)" },
				{ transform: "scale(1.2)" },
			], { duration: 800, iterations: Infinity, easing: "linear", direction: "alternate", composite: "add" })
			target.animate([
				{ transform: "rotateY(0)" },
				{ transform: "rotateY(1turn)" },
			], { duration: 400, iterations: Infinity, easing: "linear", composite: "add" })
		})
		setTimeout(() => {
			conditions++
			onEnd()
		}, 2_500)
		const onEnd = () => {
			if (conditions < 2) return
			const animation = target.animate([
				{ transform: "translateY(0)", opacity: 1 },
				{ transform: "translateY(-60vh)", opacity: 0 },
			], { duration: 500, iterations: 1, easing: "ease-in", composite: "add" })
			animation.finished.then(() => {
				target.getAnimations().forEach(anim => anim.cancel())
				button.classList.remove(styles.save)
				button.classList.add(styles.reappear)
				freeze(null)
				if (onSuccess) onSuccess("save")
			})
		}

		startTransition(() => {
			const cache = queryClient.getQueryData<Playlist>(["playlist"])
			if (!cache) {
				target.getAnimations().forEach(anim => anim.cancel())
				button.classList.remove(styles.save)
				freeze(null)
				throw new Error("Trying to save a playlist, but none found in trpc cache")
			}
			savePlaylistMutation({
				name: cache.name,
				tracks: cache.tracks.map(({ id }, index) => ({ id, index }))
			}, {
				onSuccess (playlist) {
					if (!playlist) {
						throw new Error("Trying to save a playlist, but mutation returned null")
					}
					trpcClient.playlist.get.setData({ id: playlist.id }, playlist)
					onPlaylistSaved(playlist.id, playlist.name)
					conditions++
					onEnd()
				},
				onError () {
					target.getAnimations().forEach(anim => anim.cancel())
					button.classList.remove(styles.save)
					freeze(null)
					if (onError) onError("save")
				},
			})
		})
	}
}

type Type = "save" | "delete"

function SaveButton ({
	id = null,
	className,
	noText = false,
	onBefore,
	onSuccess,
	onError,
}: {
	id: Playlist["id"] | undefined,
	className?: string
	noText?: boolean
	onBefore?: (type: Type) => void
	onSuccess?: (type: Type) => void
	onError?: (type: Type) => void
}) {
	const button = useRef<HTMLButtonElement>(null)

	const [freezeId, setFreezeId] = useState<boolean | null>(null)

	const deletePlaylist = useDeletePlaylist({
		buttonRef: button,
		freeze: setFreezeId,
		onBefore,
		onSuccess,
		onError,
	})

	const savePlaylist = useSavePlaylist({
		buttonRef: button,
		freeze: setFreezeId,
		onBefore,
		onSuccess,
		onError,
	})

	return (
		<button
			ref={button}
			type="button"
			onClick={() => {
				if (freezeId !== null)
					return
				navigator.vibrate(1)
				if (id) {
					deletePlaylist(id)
				} else {
					savePlaylist()
				}
			}}
			className={classNames(className, styles.main)}
		>
			{(freezeId ?? id) ? (
				<>
					<SavedIcon />
					{!noText && <span>Delete Playlist</span>}
				</>
			) : (
				<>
					<SaveIcon />
					{!noText && <span>Save Playlist</span>}
				</>
			)}
		</button>
	)
}

export default memo(SaveButton)