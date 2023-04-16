import { startTransition, useState, useRef } from "react"
import styles from "./index.module.css"
import PlayIcon from "icons/play_arrow.svg"
import useLongPress from "components/AlbumList/useLongPress"
import { useShowHome } from "components/AppContext"
import { shuffle } from "components/Player"
import ShuffleIcon from "icons/shuffle.svg"
import { useQueryClient } from "@tanstack/react-query"

export default function PlayButton ({
	onClick,
	className,
}: {
	onClick: () => void
	className: string
}) {
	const ref = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const onLong = () => {
		navigator.vibrate(1)
		setOpen(true)
	}
	useLongPress({ onLong, item: ref })

	const showHome = useShowHome()

	const queryClient = useQueryClient()
	const isShuffle = useRef(shuffle.getValue(queryClient))

	return (
		<div className={className}>
			<button
				ref={ref}
				className={styles.main}
				type="button"
				onClick={() => {
					navigator.vibrate(1)
					startTransition(() => {
						onClick()
						showHome("home")
					})
				}}
			>
				{isShuffle.current ? <ShuffleIcon /> : <PlayIcon />}
			</button>
			{open && (
				<button
					className={styles.secondary}
					type="button"
					onClick={() => {
						navigator.vibrate(1)
						startTransition(() => {
							shuffle.setState(!isShuffle.current, queryClient)
							onClick()
							showHome("home")
						})
					}}
				>
					{isShuffle.current ? <PlayIcon /> : <ShuffleIcon />}
				</button>
			)}
		</div>
	)
}