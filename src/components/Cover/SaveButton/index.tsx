import classNames from "classnames"
import { type Playlist, onPlaylistSaved } from "client/db/useMakePlaylist"
import { memo, startTransition, useRef, useState } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"
import SaveIcon from 'icons/library_add.svg'
import SavedIcon from 'icons/library_add_check.svg'

type IconState = 'initial' | 'in-progress' | 'failed' | 'saved' | 'deleted'

function SaveButton({id, className}: {
	id: string | null
	className?: string
}) {
	const button = useRef<HTMLButtonElement>(null)
	const trpcClient = trpc.useContext()
	const {mutate: savePlaylistMutation} = trpc.useMutation(["playlist.save"])
	const {mutate: deletePlaylistMutation} = trpc.useMutation(["playlist.delete"])

	// const [progress, setProgress] = useState<IconState>('initial')
	const [freezeId, setFreezeId] = useState<boolean | null>(null)

	const savePlaylist = () => {
		const element = button.current!
		element.classList.add(styles.progress)
		element.classList.remove(styles.reappear)
		setFreezeId(false)
		let conditions = 0

		const intro = element.animate([
			{ transform: 'scale(1) rotateY(0)'},
			{ transform: 'scale(1.4) rotateY(1turn)'},
		], { duration: 600, iterations: 1, easing: 'ease-in' })
		intro.finished.then(() => {
			element.animate([
				{ transform: 'scale(1.4)'},
				{ transform: 'scale(1.2)'},
			], { duration: 800, iterations: Infinity, easing: 'linear', direction: 'alternate', composite: 'add' })
			element.animate([
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
			const animation = element.animate([
				{ transform: 'translateY(0)', opacity: 1 },
				{ transform: 'translateY(-60vh)', opacity: 0 },
			], { duration: 500, iterations: 1, easing: 'ease-in', composite: 'add' })
			animation.finished.then(() => {
				element.getAnimations().forEach(anim => anim.cancel())
				element.classList.remove(styles.progress)
				element.classList.add(styles.reappear)
				setFreezeId(null)
			})
		}

		startTransition(() => {
			const cache = trpcClient.queryClient.getQueryData<Playlist>(["playlist"])
			if (!cache) {
				element.classList.remove(styles.progress)
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
					element.getAnimations().forEach(anim => anim.cancel())
					element.classList.remove(styles.progress)
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
		element.classList.add(styles.progress)
		element.classList.remove(styles.reappear)
		setFreezeId(true)
		let conditions = 0

		const intro = element.animate([
			{ transform: 'scale(1) rotateY(0)'},
			{ transform: 'scale(1.4) rotateY(1turn)'},
		], { duration: 600, iterations: 1, easing: 'ease-in' })
		intro.finished.then(() => {
			element.animate([
				{ transform: 'scale(1.4)'},
				{ transform: 'scale(1.2)'},
			], { duration: 800, iterations: Infinity, easing: 'linear', direction: 'alternate', composite: 'add' })
			element.animate([
				{ transform: 'rotateY(0)'},
				{ transform: 'rotateY(1turn)'},
			], { duration: 400, iterations: Infinity, easing: 'linear', composite: 'add' })
			setTimeout(() => {
				conditions++
				onEnd()
			}, 1_000)
		})
		const onEnd = () => {
			if (conditions < 2) return
			const animation = element.animate([
				{ transform: 'translateY(0)', opacity: 1 },
				{ transform: 'translateY(40vh)', opacity: 0 },
			], { duration: 600, iterations: 1, easing: 'ease-in', composite: 'add' })
			animation.finished.then(() => {
				element.getAnimations().forEach(anim => anim.cancel())
				element.classList.remove(styles.progress)
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
					element.getAnimations().forEach(anim => anim.cancel())
					element.classList.remove(styles.progress)
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