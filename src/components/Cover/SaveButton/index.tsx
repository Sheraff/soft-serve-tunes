import classNames from "classnames"
import { type Playlist, onPlaylistSaved } from "client/db/useMakePlaylist"
import { memo, startTransition, useRef, useState } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveIcon from 'icons/library_add.svg'
import SavedIcon from 'icons/collections_bookmark.svg'

function SaveButton({id, className}: {
	id: string | null
	className?: string
}) {
	const button = useRef<HTMLButtonElement>(null)
	const trpcClient = trpc.useContext()
	const {mutate: savePlaylistMutation} = trpc.useMutation(["playlist.save"])
	const {mutate: deletePlaylistMutation} = trpc.useMutation(["playlist.delete"])

	const [freezeId, setFreezeId] = useState<boolean | null>(null)

	const savePlaylist = () => {
		const element = button.current!
		element.classList.add(styles.save)
		element.classList.remove(styles.reappear)
		const target = element.firstElementChild!
		setFreezeId(false)
		let conditions = 0

		const intro = target.animate([
			{ transform: 'scale(1) rotateY(0)'},
			{ transform: 'scale(1.4) rotateY(1turn)'},
		], { duration: 600, iterations: 1, easing: 'ease-in' })
		intro.finished.then(() => {
			target.animate([
				{ transform: 'scale(1.4)'},
				{ transform: 'scale(1.2)'},
			], { duration: 800, iterations: Infinity, easing: 'linear', direction: 'alternate', composite: 'add' })
			target.animate([
				{ transform: 'rotateY(0)'},
				{ transform: 'rotateY(1turn)'},
			], { duration: 400, iterations: Infinity, easing: 'linear', composite: 'add' })
			setTimeout(() => {
				conditions++
				onEnd()
			}, 2_000)
		})
		const onEnd = () => {
			if (conditions < 2) return
			const animation = target.animate([
				{ transform: 'translateY(0)', opacity: 1 },
				{ transform: 'translateY(-60vh)', opacity: 0 },
			], { duration: 500, iterations: 1, easing: 'ease-in', composite: 'add' })
			animation.finished.then(() => {
				target.getAnimations().forEach(anim => anim.cancel())
				element.classList.remove(styles.save)
				element.classList.add(styles.reappear)
				setFreezeId(null)
			})
		}

		startTransition(() => {
			const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!cache) {
				element.classList.remove(styles.save)
				throw new Error('Trying to save a playlist, but none found in trpc cache')
			}
			savePlaylistMutation({
				name: cache.name,
				tracks: cache.tracks.map(({id}, index) => ({id, index}))
			}, {
				onSuccess(playlist) {
					trpcClient.setQueryData(["playlist.get", {id: playlist.id}], playlist)
					onPlaylistSaved(trpcClient, playlist.id)
					conditions++
					onEnd()
				},
				onError() {
					target.getAnimations().forEach(anim => anim.cancel())
					element.classList.remove(styles.save)
					setFreezeId(null)
				},
			})
		})
	}

	const deletePlaylist = () => {
		if (!id) {
			throw new Error('Trying to delete a playlist, but no ID provided')
		}
		const element = button.current!
		element.classList.add(styles.delete)
		element.classList.remove(styles.reappear)
		const target = element.firstElementChild!
		setFreezeId(true)
		let conditions = 0

		const intro = target.animate([
			{ transform: 'rotate(0)'},
			{ transform: 'rotate(65deg)'},
		], { duration: 300, iterations: 1, easing: 'ease-in' })
		intro.finished.then(() => {
			target.animate([
				{ transform: 'rotate(65deg)'},
				{ transform: 'rotate(25deg)'},
			], { duration: 500, iterations: Infinity, easing: 'ease-in-out', direction: 'alternate' })
			setTimeout(() => {
				conditions++
				onEnd()
			}, 2_000)
		})
		const onEnd = () => {
			if (conditions < 2) return
			const animation = target.animate([
				{ transform: 'translateY(0)', opacity: 1 },
				{ transform: 'translateY(40vh)', opacity: 0 },
			], { duration: 600, iterations: 1, easing: 'ease-in', composite: 'add' })
			animation.finished.then(() => {
				target.getAnimations().forEach(anim => anim.cancel())
				element.classList.remove(styles.delete)
				element.classList.add(styles.reappear)
				setFreezeId(null)
			})
		}
		startTransition(() => {
			deletePlaylistMutation({ id }, {
				onSuccess() {
					trpcClient.setQueryData(["playlist.get", {id}], null)
					onPlaylistSaved(trpcClient, null)
					conditions++
					onEnd()
				},
				onError() {
					target.getAnimations().forEach(anim => anim.cancel())
					element.classList.remove(styles.delete)
					setFreezeId(null)
				},
			})
		})
	}

	return (
		<button
			ref={button}
			type="button"
			onClick={() => {
				if (freezeId !== null)
					return
				if (id) {
					deletePlaylist()
				} else {
					savePlaylist()
				}
			}}
			className={classNames(className, styles.main)}
		>
			{(freezeId ?? id) ? (
				<>
					<SavedIcon/>
					<span>Delete Playlist</span>
				</>
			) : (
				<>
					<SaveIcon/>
					<span>Save Playlist</span>
				</>
			)}
		</button>
	)
}

export default memo(SaveButton)