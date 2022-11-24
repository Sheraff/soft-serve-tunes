import classNames from "classnames"
import { startTransition, useEffect, useRef, useState } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { albumView } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"

function AlbumItem({
	album,
	enableSiblings,
	onSelect,
}: {
	album: {id: string, name?: string}
	enableSiblings?: () => void
	onSelect?: (album: Exclude<inferQueryOutput<"album.miniature">, null>) => void
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = trpc.useQuery(["album.miniature", {id: album.id}])
	
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
	const trackCount = data?._count?.tracks ?? 0
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round(174.5 * 2)}` : ""

	const setAlbum = useSetAtom(albumView)

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
					setAlbum({
						id: album.id,
						name: data?.name || album.name,
						open: true,
						rect: {top, left, width, src}
					})
				})
			}}
		>
			{!isEmpty && (
				<img
					src={src}
					alt=""
				/>
			)}
			<p className={classNames(styles.span, {[styles.empty as string]: isEmpty})}>
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
	scrollable = false,
	lines = 2,
	loading = false,
}: {
	albums: {id: string, name?: string}[]
	onSelect?: (album: Exclude<inferQueryOutput<"album.miniature">, null>) => void
	scrollable?: boolean
	lines?: 1 | 2
	loading?: boolean
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		ref.current?.scrollTo(0, 0)
	}, [albums])

	return (
		<div className={classNames(styles.wrapper, {[styles.scrollable as string]: scrollable})} ref={ref}>
			<ul className={classNames(styles.main, styles[`lines-${lines}`], {[styles.loading]: loading})}>
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