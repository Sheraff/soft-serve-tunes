import { type Playlist, useAddToPlaylist } from "client/db/useMakePlaylist"
import { startTransition, useRef } from "react"
import styles from "./index.module.css"
import MoreIcon from "icons/auto_mode.svg"
import { trpc } from "utils/trpc"
import useIsOnline from "utils/typedWs/useIsOnline"

export default function AddMoreButton({
	id,
	tracks,
}: {
	id: Playlist["id"],
	tracks: {id: string}[]
}) {
	const addTrackToPlaylist = useAddToPlaylist()
	const {mutateAsync: getMore} = trpc.playlist.more.useMutation()
	const button = useRef<HTMLButtonElement>(null)

	const online = useIsOnline()
	if (!online) return null

	const onClick = async () => {
		navigator.vibrate(1)
		const parent = button.current
		const el = parent?.firstElementChild
		if (!el || !button) return

		parent.style.setProperty("pointer-events", "none")
		el.classList.add(styles.rotate)

		const data = await getMore({
			type: "by-similar-tracks",
			trackIds: tracks.map((item) => item.id),
		})

		await new Promise(resolve => {
			el.addEventListener("animationiteration", resolve, {once: true})
		})

		if (!data || data.length === 0) {
			el.classList.remove(styles.rotate)
			parent.style.removeProperty("pointer-events")
			el.animate([
				{ transform: "translateX(-3px)" },
				{ transform: "translateX(3px)" },
			], { duration: 100, iterations: 7, iterationStart: 0.5 })
				.finished.then((anim) => anim.cancel())
			return
		}

		const fade = el.animate([
			{opacity: 1},
			{opacity: 0},
		], { duration: 1000, fill: "forwards" })
		await fade.finished

		await addTrackToPlaylist(id, data)
		startTransition(() => {
			el.classList.remove(styles.rotate)
			parent.style.removeProperty("pointer-events")
			fade.cancel()
		})
	}

	return (
		<button
			className={styles.more}
			onClick={onClick}
			ref={button}
		>
			<span>
				<MoreIcon />
				{"Add more tracks"}
			</span>
		</button>
	)
}