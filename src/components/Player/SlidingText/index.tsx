import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import { inferQueryOutput } from "../../../utils/trpc"
import { useAppState } from "../../AppContext"
import styles from "./index.module.css"

export default function SlidingText({
	item,
	className,
}: {
	item: Exclude<inferQueryOutput<"playlist.generate">, undefined>[number] | undefined
	className?: string
}) {
	const {setAppState} = useAppState()

	const [separator, setSeparator] = useState(false)
	const span = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const element = span.current as HTMLDivElement
		const observer = new ResizeObserver(([entry]) => {
			if (entry && entry.contentRect.width > innerWidth) {
				setSeparator(true)
			} else {
				setSeparator(false)
			}
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [])

	const album = item?.album
	const artist = item?.artist

	const content = item && (
		<>
			{' '}
			{item?.name}
			{album && (
				<>
					{' · '}
					<button
						type="button"
						onClick={() => setAppState({view: {type: "album", id: album.id}})}
					>
						{album.name}
					</button>
				</>
			)}
			{artist && (
				<>
					{' · '}
					<button
						type="button"
						onClick={() => setAppState({view: {type: "artist", id: artist.id}})}
					>
						{artist.name}
					</button>
				</>
			)}
			{' '}
		</>
	)

	return (
		<div className={classNames(styles.main, className)}>
			<div className={styles.span} ref={span}>
				{content}
			</div>
			{separator && '·'}
			<div className={styles.span}>
				{content}
			</div>
		</div>
	)
}