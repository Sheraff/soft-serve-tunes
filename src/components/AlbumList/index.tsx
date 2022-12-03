import classNames from "classnames"
import { type ForwardedRef, startTransition, useEffect, useRef, useState, forwardRef } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { albumView } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"

type AlbumListItem = {
	id: string
	name?: string
}

function AlbumItem({
	album,
	enableSiblings,
	onSelect,
	index,
}: {
	album: AlbumListItem
	enableSiblings?: () => void
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	index: number
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = trpc.album.miniature.useQuery({id: album.id})
	
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
					loading={index > 1 ? "lazy" : undefined}
					decoding={index > 1 ? "async" : undefined}
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

export default forwardRef(function AlbumList({
	albums,
	onSelect,
	scrollable = false,
	lines = 2,
	loading = false,
}: {
	albums: AlbumListItem[]
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	scrollable?: boolean
	lines?: 1 | 2
	loading?: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	return (
		<div className={classNames(styles.wrapper, {[styles.scrollable as string]: scrollable})} ref={ref}>
			<ul className={
				classNames(styles.main, {
					[styles.loading]: loading,
					[styles['lines-2']]: lines === 2,
				})
			}>
				{albums.map((album, i) => (
					<li className={styles.item} key={album.id}>
						{i <= enableUpTo && (
							<AlbumItem
								album={album}
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
})