import type { Album } from "@prisma/client"
import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"
import styles from "./index.module.css"

function AlbumItem({
	album,
	enableSiblings,
}: {
	album: Album
	enableSiblings?: () => void
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

	let imgSrc = ""
	if (data?.spotify?.imageId) {
		imgSrc = data.spotify.imageId
	} else if (data?.audiodb?.thumbHqId) {
		imgSrc = data.audiodb.thumbHqId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.lastfm?.coverId) {
		imgSrc = data.lastfm.coverId
	} else if (data?.tracks?.[0]?.metaImageId) {
		imgSrc = data.tracks[0].metaImageId
	}

	const isEmpty = !imgSrc
	const trackCount = data?._count?.tracks ?? 0

	const {setRoute} = useRouteParts()

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={styles.button}
			type="button"
			onClick={() => setRoute({type: "album", id: album.id, name: album.name})}
		>
			{!isEmpty && (
				<img
					src={imgSrc ? `/api/cover/${imgSrc}` : ""}
					alt=""
				/>
			)}
			<p className={classNames(styles.span, {[styles.empty]: isEmpty})}>
				<span className={styles.name}>{album.name}</span>
				{data?.artist?.name && <span>{data?.artist?.name}</span>}
				<span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>
			</p>
		</button>
	)
}

export default function AlbumList({
	albums
}: {
	albums: Album[]
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)
	return (
		<div className={styles.wrapper}>
			<ul className={styles.main}>
				{albums.map((album, i) => (
					<li className={styles.item} key={album.id}>
						{i <= enableUpTo && (
							<AlbumItem
								album={album}
								enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}