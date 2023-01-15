import classNames from "classnames"
import styles from "./index.module.css"
import { type ReactNode, startTransition } from "react"

export function BasePastSearchItem({
	className,
	coverId,
	onClick,
	children,
	name,
}: {
	className?: string
	coverId?: string | null
	onClick: () => void
	children: ReactNode
	name?: string
}) {
	const src = coverId ? `/api/cover/${coverId}/${Math.round(56 * 2)}` : undefined
	return (
		<button
			type="button"
			className={classNames(
				styles.main,
				className,
				{ [styles.empty]: !src }
			)}
			onClick={() => {
				navigator.vibrate(1)
				startTransition(() => {
					onClick()
				})
			}}
		>
			{src && (
				<img
					className={styles.img}
					src={src}
					alt=""
				/>
			)}
			<div className={styles.content}>
				{name && (
					<>
						<p className={styles.name}>{name}</p>
						{children}
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
}