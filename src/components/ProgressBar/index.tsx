import classNames from "classnames"
import { type Dispatch, type SetStateAction, useState } from "react"
import styles from "./index.module.css"

let singletonSetProgress: Dispatch<SetStateAction<number>> | null = null
export function ProgressBarSingleton() {
	const [progress, setProgress] = useState(0)
	singletonSetProgress = setProgress
	return (
		<div
			className={classNames(styles.progress, {
				[styles.done]: progress === 1,
			})}
			style={{
				"--progress": progress
			} as React.CSSProperties}
		/>
	)
}

export function useProgressBar() {
	return singletonSetProgress as Dispatch<SetStateAction<number>>
}