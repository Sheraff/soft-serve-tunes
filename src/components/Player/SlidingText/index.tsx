import classNames from "classnames"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { mainView, openPanel, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { getCurrentIndex } from "client/db/useMakePlaylist"

type SlidingTextItem = {
	name: string
	album: {
		id: string
		name: string
	} | null
	artist: {
		id: string
		name: string
	} | null
}

export default memo(function SlidingText ({
	item,
	className,
}: {
	item: SlidingTextItem | undefined
	className?: string
}) {
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
	const main = mainView.useValue()
	const scrollToCurrent = useCallback(() => {
		// @ts-expect-error -- this is a hack to expose the scroll function
		const scrollToIndex = window._scrollNowPlayingToIndex as ((index: number) => void) | undefined
		if (!scrollToIndex) return
		const index = getCurrentIndex()
		if (typeof index === "undefined") return
		scrollToIndex(index)
	}, [])
	useEffect(() => {
		if (main !== "home") return
		if (!focusRef.current) return
		focusRef.current = false
		scrollToCurrent()
	}, [main, scrollToCurrent])
	const onClickTrackName = () => {
		navigator.vibrate(1)
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
					{" · "}
					<button
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							openPanel("album", {
								id: album.id,
								name: album.name,
							})
						}}
					>
						{album.name}
					</button>
				</>
			)}
			{artist && (
				<>
					{" · "}
					<button
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							openPanel("artist", {
								id: artist.id,
								name: artist.name,
							})
						}}
					>
						{artist.name}
					</button>
				</>
			)}
		</>
	)

	return (
		<div className={classNames(styles.main, className, { [styles.sliding as string]: separator })}>
			<div className={styles.wrapper}>
				<div className={styles.span} ref={span} key="base">
					{content}
				</div>
				{separator && (
					<div className={styles.span} key="clone">
						{"· "}
						{content}
						{" · "}
					</div>
				)}
			</div>
		</div>
	)
})