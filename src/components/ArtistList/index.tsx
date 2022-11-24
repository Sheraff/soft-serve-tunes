import classNames from "classnames"
import { startTransition, useEffect, useRef, useState } from "react"
import { trpc, type inferQueryOutput } from "utils/trpc"
import { artistView } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"

type ArtistListItem = {
	id: string
	name: string
}

function ArtistItem({
	artist,
	enableSiblings,
	onSelect,
	index,
}: {
	artist: ArtistListItem
	enableSiblings?: () => void
	onSelect?: (artist: Exclude<inferQueryOutput<"artist.miniature">, null>) => void
	index: number
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = trpc.useQuery(["artist.miniature", {id: artist.id}])
	
	useEffect(() => {
		if (!enableSiblings || !item.current) return

		const observer = new IntersectionObserver(([entry]) => {
			if (entry?.isIntersecting) {
				startTransition(() => {
					enableSiblings()
				})
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
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round((393-4*8)/3 * 2)}` : undefined

	const setArtist = useSetAtom(artistView)

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={styles.button}
			type="button"
			onClick={(event) => {
				data && onSelect?.(data)
				const element = event.currentTarget
				const {top, left, width} = element.getBoundingClientRect()
				startTransition(() => {
					setArtist({
						id: artist.id,
						name: data?.name || artist.name,
						open: true,
						rect: {top, left, width, src}
					})
				})
			}}
		>
			{!isEmpty && (
				<div className={styles.img}>
					<img
						src={src}
						alt=""
						loading={index > 2 ? "lazy" : undefined}
						decoding={index > 2 ? "async" : undefined}
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
	artists: ArtistListItem[]
	onSelect?: (artist: Exclude<inferQueryOutput<"artist.miniature">, null>) => void
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
								index={i}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}