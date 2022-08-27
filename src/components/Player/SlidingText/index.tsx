import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import { inferQueryOutput } from "utils/trpc"
import { albumView, artistView } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"

export default function SlidingText({
	item,
	className,
}: {
	item: Exclude<inferQueryOutput<"playlist.generate">, undefined>[number] | undefined
	className?: string
}) {
	const setAlbum = useSetAtom(albumView)
	const setArtist = useSetAtom(artistView)

	const [separator, setSeparator] = useState(false)
	const span = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const element = span.current as HTMLDivElement
		const observer = new ResizeObserver(([entry]) => {
			if (entry && entry.contentRect.width > (entry.target.parentElement as HTMLElement).offsetWidth) {
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
			{item?.name}
			{album && (
				<>
					{' · '}
					<button
						type="button"
						onClick={() => setAlbum({id: album.id, name: album.name, open: true})}
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
						onClick={() => setArtist({id: artist.id, name: artist.name, open: true})}
					>
						{artist.name}
					</button>
				</>
			)}
			{separator && ' · '}
		</>
	)

	return (
		<div className={classNames(styles.main, className, {[styles.sliding as string]: separator})}>
			<div className={styles.span} ref={span}>
				{content}
			</div>
			{separator && (
				<div className={styles.span}>
					{content}
				</div>
			)}
		</div>
	)
}