import classNames from "classnames"
import { ReactNode } from "react"
import styles from "./index.module.css"

export default function SectionTitle({
	children,
	className,
}: {
	children: ReactNode
	className?: string
}) {
	return (
		<h2 className={classNames(styles.main, className)}>
			{children}
		</h2>
	)
}