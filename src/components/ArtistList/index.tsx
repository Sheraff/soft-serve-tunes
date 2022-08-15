import type { Artist } from "@prisma/client"
import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"
import styles from "./index.module.css"

function ArtistItem({
	artist,
	defaultEnabled,
}: {
	artist: Artist
	defaultEnabled: boolean
}) {
	const item = useRef<HTMLLIElement>(null)
	const [enabled, setEnabled] = useState(defaultEnabled)
	const {data} = useIndexedTRcpQuery(["artist.miniature", {id: artist.id}], {
		enabled,
	})
	
	useEffect(() => {
		if (enabled || !item.current) return

		const observer = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) {
				setEnabled(true)
			}
		}, {
			rootMargin: "0px 100px 0px 0px",
		})
		observer.observe(item.current)

		return () => observer.disconnect()
	}, [enabled])

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

	const {setRoute} = useRouteParts()

	return (
		<li className={styles.item} ref={item}>
			<button
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
				<span className={classNames(styles.span, {[styles.empty]: isEmpty})}>
					{artist.name}
				</span>
			</button>
		</li>
	)
}

export default function ArtistList({
	artists
}: {
	artists: Artist[]
}) {
	return (
		<div className={styles.wrapper}>
			<ul className={styles.main}>
				{artists.map((artist, i) => (
					<ArtistItem
						key={artist.id}
						artist={artist}
						defaultEnabled={i < 9}
					/>
				))}
			</ul>
		</div>
	)
}