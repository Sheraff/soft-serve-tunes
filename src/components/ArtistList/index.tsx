import classNames from "classnames"
import { useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import { inferQueryOutput } from "utils/trpc"
import { artistView } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"

function ArtistItem({
	artist,
	enableSiblings,
	onSelect,
}: {
	artist: {id: string, name: string}
	enableSiblings?: () => void
	onSelect?: (artist: inferQueryOutput<"artist.miniature">) => void
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

	const isEmpty = !data?.cover
	const albumCount = data?._count?.albums ?? 0
	const trackCount = data?._count?.tracks ?? 0
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round((393-4*8)/3 * 2.5)}` : undefined

	const setArtist = useSetAtom(artistView)

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={styles.button}
			type="button"
			onClick={(event) => {
				data && onSelect?.(data)
				const {top, left, width} = event.currentTarget.getBoundingClientRect()
				setArtist({
					id: artist.id,
					name: data?.name || artist.name,
					open: true,
					rect: {top, left, width, src}
				})
			}}
		>
			{!isEmpty && (
				<div className={styles.img}>
					<img
						src={src}
						alt=""
					/>
				</div>
			)}
			<p className={classNames(styles.span, {[styles.empty as string]: isEmpty})}>
				<span className={styles.name}>{artist.name}</span>
				{albumCount > 1 && <span>{albumCount} albums</span>}
				{albumCount <= 1 && trackCount > 0 && <span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>}
			</p>
		</button>
	)
}

export default function ArtistList({
	artists,
	onSelect,
	lines = 3,
	loading = false,
}: {
	artists: {id: string, name: string}[]
	onSelect?: (artist: inferQueryOutput<"artist.miniature">) => void
	lines?: 1 | 3
	loading?: boolean
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		ref.current?.scrollTo(0, 0)
	}, [artists])

	return (
		<div className={styles.wrapper} ref={ref}>
			<ul className={classNames(styles.main, styles[`lines-${lines}`], {[styles.loading]: loading})}>
				{artists.map((artist, i) => (
					<li className={styles.item} key={artist.id}>
						{i <= enableUpTo && (
							<ArtistItem
								artist={artist}
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