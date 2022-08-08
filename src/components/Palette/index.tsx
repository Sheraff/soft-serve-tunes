import { ReactNode, RefObject } from "react"
import useImagePalette from "./useImagePalette"
import styles from "./index.module.css"

export default function Palette({
	children,
	img,
}: {
	children: ReactNode
	img: RefObject<HTMLImageElement>
}) {
	const palette = useImagePalette({ref: img})
	return (
		<div
			className={styles.main}
			style={{
				'--background-color': palette.background,
				'--gradient-color': palette.gradient,
				'--foreground-color': palette.foreground,
			} as React.CSSProperties}
		>
			{children}
		</div>
	)
}