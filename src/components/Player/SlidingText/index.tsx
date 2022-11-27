import classNames from "classnames"
import { useCallback, useEffect, useRef, useState } from "react"
import { inferQueryOutput } from "utils/trpc"
import { albumView, artistView, mainView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { useAtomValue, useSetAtom } from "jotai"
import { useGetCurrentIndex } from "client/db/useMakePlaylist"

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
			if (entry && entry.contentRect.width > entry.target.parentElement!.parentElement!.offsetWidth + 2) { // 2px margin to avoid issues
				setSeparator(true)
			} else {
				setSeparator(false)
			}
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [])

	const showHome = useShowHome()
	const focusRef = useRef<boolean>(false)
	const main = useAtomValue(mainView)
	const getCurrentIndex = useGetCurrentIndex()
	const scrollToCurrent = useCallback(() => {
		const index = getCurrentIndex()
		if (typeof index === "undefined") return
		const element = document.querySelector(`[data-index="${index}"]`)
		if (!element) return
		element.scrollIntoView({
			behavior: "smooth",
			block: "center",
		})
	}, [getCurrentIndex])
	useEffect(() => {
		if (main !== "home") return
		if (!focusRef.current) return
		focusRef.current = false
		scrollToCurrent()
	}, [main, scrollToCurrent])
	const onClickTrackName = () => {
		if (main === "home") {
			scrollToCurrent()
		} else {
			focusRef.current = true
			showHome("home")
		}
	}


	const album = item?.album
	const artist = item?.artist

	const content = item && (
		<>
			<button
				type="button"
				onClick={onClickTrackName}
			>
				{item?.name}
			</button>
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
		</>
	)

	return (
		<div className={classNames(styles.main, className, {[styles.sliding as string]: separator})}>
			<div className={styles.wrapper}>
				<div className={styles.span} ref={span} key="base">
					{content}
				</div>
				{separator && (
					<div className={styles.span} key="clone">
						{'· '}
						{content}
						{' · '}
					</div>
				)}
			</div>
		</div>
	)
}