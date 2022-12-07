import classNames from "classnames"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { type RouterOutputs } from "utils/trpc"
import { albumView, artistView, mainView, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { useGetCurrentIndex } from "client/db/useMakePlaylist"
import { useQueryClient } from "@tanstack/react-query"

export default memo(function SlidingText({
	item,
	className,
}: {
	item: Exclude<RouterOutputs["playlist"]["generate"], undefined>[number] | undefined
	className?: string
}) {
	const queryClient = useQueryClient()

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
					{' · '}
					<button
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							albumView.setState({id: album.id, name: album.name, open: true}, queryClient)
						}}
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
						onClick={() => {
							navigator.vibrate(1)
							artistView.setState({id: artist.id, name: artist.name, open: true}, queryClient)
						}}
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
})