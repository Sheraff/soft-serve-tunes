import type { Track } from "@prisma/client"
import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"
import styles from "./index.module.css"

function TrackItem({
	track,
	enableSiblings,
	current,
	onClick,
}: {
	track: Track
	enableSiblings?: () => void
	current?: boolean
	onClick?: (id:string, name:string) => void
}) {
	const item = useRef<HTMLButtonElement>(null)
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

	let imgSrc = ""
	if (data?.spotify?.album?.imageId) {
		imgSrc = data.spotify.album?.imageId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.audiodb?.album.thumbHqId) {
		imgSrc = data.audiodb.album.thumbHqId
	} else if (data?.audiodb?.album.thumbId) {
		imgSrc = data.audiodb.album.thumbId
	} else if (data?.lastfm?.album?.coverId) {
		imgSrc = data.lastfm.album.coverId
	} else if (data?.metaImageId) {
		imgSrc = data.metaImageId
	}

	const isEmpty = !imgSrc

	const {setRoute} = useRouteParts()

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={classNames(styles.button, {
				[styles.empty]: isEmpty,
				[styles.current]: current,
			})}
			type="button"
			onClick={() => {
				if (onClick) onClick(track.id, track.name)
				else setRoute({type: "track", id: track.id, name: track.name})
			}}
		>
			{!isEmpty && (
				<div className={styles.img}>
					<img
						src={imgSrc ? `/api/cover/${imgSrc}` : ""}
						alt=""
					/>
				</div>
			)}
			<p className={styles.span}>
				<span className={styles.name}>{data?.name}</span>
				{data?.album?.name && <span>{data?.album.name}</span>}
				{data?.artist?.name && <span>{data?.artist.name}</span>}
			</p>
		</button>
	)
}

export default function TrackList({
	tracks,
	current,
	onClick,
}: {
	tracks: Track[]
	current?: string
	onClick: Parameters<typeof TrackItem>[0]["onClick"]
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
						/>
					)}
				</li>
			))}
		</ul>
	)
}