import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { inferQueryOutput } from "../../utils/trpc"
import { useAppState } from "../AppContext"
import styles from "./index.module.css"

function AlbumItem({
	album,
	enableSiblings,
	onSelect,
}: {
	album: inferQueryOutput<"artist.searchable">[number]
	enableSiblings?: () => void
	onSelect?: (album: inferQueryOutput<"album.miniature">) => void
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = useIndexedTRcpQuery(["album.miniature", {id: album.id}])
	
	useEffect(() => {
		if (!enableSiblings || !item.current) return

		const observer = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) {
				enableSiblings()
			}
		}, {
			rootMargin: "0px 100px 0px 0px",
		})
		observer.observe(item.current)

		return () => observer.disconnect()
	}, [enableSiblings])

	

	const isEmpty = !data?.cover?.id
	const trackCount = data?._count?.tracks ?? 0

	const {setAppState} = useAppState()

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={styles.button}
			type="button"
			onClick={() => {
				data && onSelect?.(data)
				setAppState({view: {type: "album", id: album.id}})
			}}
		>
			{!isEmpty && (
				<img
					src={data?.cover ? `/api/cover/${data.cover.id}/${Math.round(174.5*2.5)}` : ""}
					alt=""
				/>
			)}
			<p className={classNames(styles.span, {[styles.empty]: isEmpty})}>
				<span className={styles.name}>{data?.name || album.name}</span>
				{data?.artist?.name && <span>{data?.artist?.name}</span>}
				<span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>
			</p>
		</button>
	)
}

export default function AlbumList({
	albums,
	onSelect,
}: {
	albums: inferQueryOutput<"album.searchable">
	onSelect?: (album: inferQueryOutput<"album.miniature">) => void
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		ref.current?.scrollTo(0, 0)
	}, [albums])

	return (
		<div className={styles.wrapper} ref={ref}>
			<ul className={styles.main}>
				{albums.map((album, i) => (
					<li className={styles.item} key={album.id}>
						{i <= enableUpTo && (
							<AlbumItem
								album={album}
								enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
								onSelect={onSelect}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}