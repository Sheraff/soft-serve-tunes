import { startTransition, useState, useRef, type ReactElement, type ReactFragment } from "react"
import styles from "./index.module.css"
import PlayIcon from "icons/play_arrow.svg"
import useLongPress from "components/AlbumList/useLongPress"
import { showHome } from "components/AppContext"
import { shuffle } from "components/Player"
import ShuffleIcon from "icons/shuffle.svg"

export default function PlayButton ({
	onClick,
	className,
	children,
}: {
	onClick: () => void
	className: string
	children?: ReactElement | ReactFragment
}) {
	const ref = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const onLong = () => {
		navigator.vibrate(1)
		setOpen(true)
	}
	useLongPress({ onLong, item: ref })

	const isShuffle = useRef(shuffle.getValue())

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
				<div className={styles.extra}>
					<button
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							startTransition(() => {
								shuffle.setState(!isShuffle.current)
								onClick()
								showHome("home")
							})
						}}
					>
						{isShuffle.current ? <PlayIcon /> : <ShuffleIcon />}
					</button>
					{children}
				</div>
			)}
		</div>
	)
}