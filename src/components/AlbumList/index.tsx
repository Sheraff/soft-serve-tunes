import classNames from "classnames"
import { type ForwardedRef, startTransition, useEffect, useRef, useState, forwardRef, useDeferredValue } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { openPanel } from "components/AppContext"
import CheckIcon from "icons/done.svg"
import styles from "./index.module.css"
import { useQueryClient } from "@tanstack/react-query"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import useLongPress from "./useLongPress"

type AlbumListItem = {
	id: string
	name?: string
}

function AlbumItem({
	album,
	enableSiblings,
	onSelect,
	onClick,
	index,
	selected,
	selectable,
}: {
	album: AlbumListItem
	enableSiblings?: () => void
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	onClick?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	index: number
	selected: boolean
	selectable: boolean
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

	const queryClient = useQueryClient()

	const onLong = selectable ? () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({type: "album", id: album.id}),
			queryClient
		)
	} : undefined
	useLongPress({onLong, item})

	return (
		<button
			ref={item}
			className={classNames(styles.button, {[styles.selected]: selected})}
			type="button"
			onClick={(event) => {
				if (onLong && editOverlay.getValue(queryClient).type === "album") {
					onLong()
					return
				}
				navigator.vibrate(1)
				if (onClick) {
					data && onClick(data)
					return
				}
				data && onSelect?.(data)
				const element = event.currentTarget
				const {top, left, width} = element.getBoundingClientRect()
				startTransition(() => {
					openPanel("album", {
						id: album.id,
						name: data?.name || album.name,
						rect: {top, left, width, src}
					}, queryClient)
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
			<p className={classNames(styles.span, {
				[styles.empty]: isEmpty,
				[styles.two]: !data?.artist?.name,
			})}>
				<span className={styles.name}>{data?.name || album.name}</span>
				{data?.artist?.name && <span>{data?.artist?.name}</span>}
				<span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>
				{selected && <CheckIcon className={styles.icon} />}
			</p>
		</button>
	)
}

export default forwardRef(function AlbumList({
	albums,
	onSelect,
	onClick,
	scrollable = false,
	lines = 2,
	loading = false,
	selected,
	selectable = true,
}: {
	albums: AlbumListItem[]
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	onClick?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	scrollable?: boolean
	lines?: 1 | 2
	loading?: boolean
	selected?: string
	selectable?: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const [enableUpTo, setEnableUpTo] = useState(12)

	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = selectable && editViewState.type === "album"

	return (
		<div className={classNames(styles.wrapper, {[styles.scrollable]: scrollable})} ref={ref}>
			<ul className={
				classNames(styles.main, {
					[styles.loading]: loading,
					[styles["lines-2"]]: lines === 2,
				})
			}>
				{albums.map((album, i) => (
					<li className={styles.item} key={album.id}>
						{i <= enableUpTo && (
							<AlbumItem
								album={album}
								enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
								onSelect={onSelect}
								onClick={onClick}
								index={i}
								selected={selected === album.id || (isSelection && editViewState.selection.some(({id}) => id === album.id))}
								selectable={selectable}
							/>
						)}
					</li>
				))}
			</ul>
		</div>
	)
})