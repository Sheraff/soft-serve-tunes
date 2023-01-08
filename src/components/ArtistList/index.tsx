import classNames from "classnames"
import { type ForwardedRef, forwardRef, startTransition, useEffect, useRef, useState } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { artistView } from "components/AppContext"
import styles from "./index.module.css"
import CheckIcon from "icons/done.svg"
import { useQueryClient } from "@tanstack/react-query"

type ArtistListItem = {
	id: string
	name: string
}

function ArtistItem({
	artist,
	enableSiblings,
	onSelect,
	onClick,
	index,
	selected,
}: {
	artist: ArtistListItem
	enableSiblings?: () => void
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	index: number
	selected: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const {data} = trpc.artist.miniature.useQuery({id: artist.id})
	
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

	const isEmpty = data && !data.cover
	const albumCount = data?._count?.albums ?? 0
	const trackCount = data?._count?.tracks ?? 0
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round((393-4*8)/3 * 2)}` : undefined

	const queryClient = useQueryClient()

	return (
		<button
			ref={enableSiblings ? item : undefined}
			className={classNames(styles.button, {[styles.selected]: selected})}
			type="button"
			onClick={(event) => {
				navigator.vibrate(1)
				if (onClick) {
					data && onClick(data)
					return
				}
				data && onSelect?.(data)
				const element = event.currentTarget
				const {top, left, width} = element.getBoundingClientRect()
				startTransition(() => {
					artistView.setState({
						id: artist.id,
						name: data?.name || artist.name,
						open: true,
						rect: {top, left, width, src}
					}, queryClient)
				})
			}}
		>
			{!isEmpty && (
				<div className={styles.img}>
					{src && (
						<img
							src={src}
							alt=""
							loading={index > 2 ? "lazy" : undefined}
							decoding={index > 2 ? "async" : undefined}
						/>
					)}
				</div>
			)}
			<p className={classNames(styles.span, {[styles.empty]: isEmpty})}>
				<span className={styles.name}>{artist.name}</span>
				{!data && <span>&nbsp;</span>}
				{albumCount > 1 && <span>{albumCount} albums</span>}
				{albumCount <= 1 && trackCount > 0 && <span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>}
			</p>

			{selected && (
				<CheckIcon className={styles.check} />
			)}
		</button>
	)
}

export default forwardRef(function ArtistList({
	artists,
	onSelect,
	onClick,
	lines = 3,
	loading = false,
	selected,
}: {
	artists: ArtistListItem[]
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	lines?: 1 | 3
	loading?: boolean
	selected?: string
}, ref: ForwardedRef<HTMLDivElement>) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	return (
		<div
			className={styles.wrapper}
			ref={ref}
		>
			<ul className={classNames(styles.main, styles[`lines-${lines}`], {[styles.loading]: loading})}>
				{artists.map((artist, i) => (
					<li className={styles.item} key={artist.id}>
						{i <= enableUpTo && (
							<ArtistItem
								artist={artist}
								enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
								onSelect={onSelect}
								onClick={onClick}
								index={i}
								selected={selected === artist.id}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
})