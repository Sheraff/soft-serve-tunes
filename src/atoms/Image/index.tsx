import classNames from "classnames"
import { ComponentProps, type CSSProperties } from "react"
import { getCoverUrl } from "utils/getCoverUrl"
import styles from "./index.module.css"

export default function Image ({
	cover,
	size,
	className,
	...props
}: {
	cover: {
		id: Parameters<typeof getCoverUrl>[0]
		blur?: string | null
	} | undefined | null
	size: Parameters<typeof getCoverUrl>[1]
	className?: string
} & Omit<ComponentProps<"img">, "src" | "alt" | "className">) {
	return (
		<img
			{...props}
			className={classNames(className, styles.img)}
			src={getCoverUrl(cover?.id, size)}
			alt=""
			style={{
				'--blur': cover?.blur ? `url("${cover.blur}")` : undefined,
			} as CSSProperties}
		/>
	)
}