import type { MouseEvent as ReactMouseEvent, ReactNode } from "react"
import CloseIcon from "icons/close.svg"
import styles from "./index.module.css"
import { createPortal } from "react-dom"

export default function Dialog({
	title,
	children,
	open,
	onClose,
}: {
	title: string
	children: ReactNode
	open: boolean
	onClose: () => void
}) {

	if (!open) {
		return null
	}

	const closeOnBackdropClick = (event: ReactMouseEvent<HTMLDivElement, MouseEvent>) => {
		if(event.target === event.currentTarget) {
			onClose()
		}
	}

	return (
		createPortal((
			<div className={styles.backdrop} onClick={closeOnBackdropClick}>
				<div className={styles.main}>
					<div className={styles.head}>
						<h1>{title}</h1>
						<button
							type="button"
							onClick={onClose}
							className={styles.close}
						>
							<CloseIcon />
						</button>
					</div>
					{children}
				</div>
			</div>
		), document.getElementById("modal")!)
	)
}