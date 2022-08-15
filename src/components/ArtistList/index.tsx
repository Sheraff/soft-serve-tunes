import type { Artist } from "@prisma/client"
import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"
import styles from "./index.module.css"

function ArtistItem({
	artist,
	enableSiblings,
}: {
	artist: Artist
	enableSiblings?: () => void
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = useIndexedTRcpQuery(["artist.miniature", {id: artist.id}])
	
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
	if (data?.audiodb?.cutoutId) {
		imgSrc = data.audiodb.cutoutId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.spotify?.imageId) {
		imgSrc = data.spotify.imageId
	} else if (data?.tracks?.[0]?.metaImageId) {
		imgSrc = data.tracks[0].metaImageId
	}

	const isEmpty = !imgSrc
	const isCutout = data?.audiodb?.cutoutId
	const albumCount = data?._count?.albums ?? 0
	const trackCount = data?._count?.tracks ?? 0

	const {setRoute} = useRouteParts()

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={styles.button}
			type="button"
			onClick={() => setRoute({type: "artist", id: artist.id, name: artist.name})}
		>
			{!isEmpty && (
				<div className={classNames(styles.img, {[styles.cutout]: isCutout})}>
					<img
						src={imgSrc ? `/api/cover/${imgSrc}` : ""}
						alt=""
					/>
				</div>
			)}
			<p className={classNames(styles.span, {[styles.empty]: isEmpty})}>
				<span className={styles.name}>{artist.name}</span>
				{albumCount > 1 && <span>{albumCount} albums</span>}
				{albumCount <= 1 && trackCount > 0 && <span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>}
			</p>
		</button>
	)
}

export default function ArtistList({
	artists
}: {
	artists: Artist[]
}) {
	const [enableUpTo, setEnableUpTo] = useState(9)
	return (
		<div className={styles.wrapper}>
			<ul className={styles.main}>
				{artists.map((artist, i) => (
					<li className={styles.item} key={artist.id}>
						{i <= enableUpTo && (
							<ArtistItem
								artist={artist}
								enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 9) : undefined}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}