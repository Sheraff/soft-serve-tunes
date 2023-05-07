import classNames from "classnames"
import styles from "./index.module.css"
import { type ReactNode, startTransition, useRef, useDeferredValue } from "react"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import useLongPress from "components/AlbumList/useLongPress"
import CheckboxOnIcon from "icons/check_box_on.svg"
import CheckboxOffIcon from "icons/check_box_off.svg"
import OfflineIcon from "icons/wifi_off.svg"
import { getCoverUrl } from "utils/getCoverUrl"
import Image from "atoms/Image"

export function BasePastSearchItem ({
	className,
	cover,
	onClick,
	children,
	name,
	type,
	id,
	available,
}: {
	className?: string
	cover?: {
		id: string
		blur?: string | null | undefined
	} | undefined | null
	onClick: () => void
	children: ReactNode
	name?: string
	type: "album" | "artist" | "playlist" | "track" | "genre"
	id: string
	available?: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const [_edit, setEdit] = editOverlay.useState()
	const onLong = () => {
		navigator.vibrate(1)
		setEdit(editOverlaySetter({ type, id }))
	}
	useLongPress({ onLong, item })

	const edit = useDeferredValue(_edit)
	const selection = edit.selection.length > 0
	const selected = selection && edit.selection.some((item) => item.id === id)
	const hasImage = Boolean(cover?.id)

	return (
		<button
			ref={item}
			type="button"
			className={classNames(
				styles.main,
				className,
				{
					[styles.empty]: !hasImage,
					[styles.selection]: selection,
				}
			)}
			onClick={() => {
				if (onLong && selection) {
					onLong()
					return
				}
				navigator.vibrate(1)
				startTransition(() => {
					onClick()
				})
			}}
		>
			{selection && !selected && (
				<CheckboxOffIcon className={styles.selected} />
			)}
			{selection && selected && (
				<CheckboxOnIcon className={styles.selected} />
			)}
			{hasImage && (
				<Image
					cover={cover}
					size="mini"
					className={styles.img}
				/>
			)}
			<div className={styles.content}>
				{name && (
					<>
						<p className={styles.name}>{name}</p>
						<p className={styles.info}>
							{children}
						</p>
						{!available && <OfflineIcon className={styles.icon} />}
					</>
				)}
			</div>
		</button>
	)
}

export type PastSearchProps = {
	id: string
	onSettled?: (data: boolean) => void
	onClick?: () => void
	showType?: boolean
	forceAvailable?: boolean
}