import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import { inferQueryOutput } from "utils/trpc"
import { useAppState } from "components/AppContext"
import styles from "./index.module.css"
import useSlideTrack from "./useSlideTrack"
import FavoriteIcon from "icons/favorite.svg"
import PlayIcon from "icons/play_arrow.svg"

function TrackItem({
	track,
	enableSiblings,
	current,
	onClick,
	onSelect,
}: {
	track: inferQueryOutput<"track.searchable">[number]
	enableSiblings?: () => void
	current?: boolean
	onClick?: (id:string, name:string) => void
	onSelect?: (track: inferQueryOutput<"track.miniature">) => void
}) {
	const item = useRef<HTMLDivElement>(null)
	const {data} = useIndexedTRcpQuery(["track.miniature", {id: track.id}])
	
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

	const isEmpty = !data?.cover

	const {setAppState, view: {type}, playlist} = useAppState()

	useSlideTrack(item, {id: track.id, favorite: data?.userData?.favorite})

	return (
		<div ref={item} className={classNames(styles.wrapper, {
			[styles.liked as string]: data?.userData?.favorite
		})}>
			<button
				className={classNames(styles.button, {
					[styles.empty as string]: isEmpty,
					[styles.current as string]: current,
				})}
				type="button"
				onClick={() => {
					data && onSelect?.(data)
					if (onClick) onClick(track.id, track.name)
					else setAppState({playlist: {type: "track", id: track.id, index: 0}, view: {type: "home"}})
				}}
			>
				{!isEmpty && (
					<div className={styles.img}>
						<img
							src={`/api/cover/${data.cover?.id}/${Math.round(48 * 2.5)}`}
							alt=""
						/>
					</div>
				)}
				{current && (
					<PlayIcon className={styles.play}/>
				)}
				<p className={styles.span}>
					<span className={styles.name}>
						{( data?.position && (
							type === "album" 
							|| (type === "home" && playlist?.type === "album")
						)) && (
							`${data?.position?.toString().padStart(2, '0')} · `
						)}
						{data?.name}
					</span>
					{data?.album?.name && <span>{data?.album.name}</span>}
					{data?.artist?.name && <span>{data?.artist.name}</span>}
				</p>
			</button>
			<FavoriteIcon className={styles.fav} />
		</div>
	)
}

export default function TrackList({
	tracks,
	current,
	onClick,
	onSelect,
}: {
	tracks: inferQueryOutput<"track.searchable">
	current?: string
	onClick?: Parameters<typeof TrackItem>[0]["onClick"]
	onSelect?: (track: Exclude<inferQueryOutput<"track.miniature">, null>) => void
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)
	return (
		<ul className={styles.main}>
			{tracks.map((track, i) => (
				<li className={styles.item} key={track.id}>
					{i <= enableUpTo && (
						<TrackItem
							track={track}
							enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
							current={current === track.id}
							onClick={onClick}
							onSelect={onSelect}
						/>
					)}
				</li>
			))}
		</ul>
	)
}