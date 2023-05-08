import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import { type CSSProperties, startTransition, useDeferredValue, useRef, type ReactNode, useEffect, useState } from "react"
import PlaylistIcon from "icons/queue_music.svg"
import CheckboxOnIcon from "icons/check_box_on.svg"
import CheckboxOffIcon from "icons/check_box_off.svg"
import OfflineIcon from "icons/wifi_off.svg"
import { type RouterOutputs, trpc } from "utils/trpc"
import pluralize from "utils/pluralize"
import useLongPress from "components/AlbumList/useLongPress"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import classNames from "classnames"
import { useVirtualizer } from "@tanstack/react-virtual"
import { getCoverUrl } from "utils/getCoverUrl"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedGenre } from "client/sw/useSWCached"

type GenreListItem = {
	id: string
	name?: string
}

export function GenreItem ({
	genre,
	onSelect,
	onClick,
	selected,
	isSelection,
	forceAvailable,
}: {
	genre: GenreListItem
	onSelect?: (genre: GenreListItem) => void
	onClick?: (genre: Exclude<RouterOutputs["genre"]["miniature"], null>) => void
	selected?: boolean
	isSelection: boolean
	forceAvailable?: boolean
}) {
	const { data } = trpc.genre.miniature.useQuery({ id: genre.id }, {
		select (data) {
			if (!data?.artists) return data
			return { ...data, artists: data.artists.filter(({ coverId }) => coverId).reverse() }
		},
	})

	const item = useRef<HTMLButtonElement>(null)
	const onLong = () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "genre", id: genre.id })
		)
	}
	useLongPress({ onLong, item })

	const count = data?._count.tracks ?? 0

	const online = useIsOnline()
	const { data: cached } = useCachedGenre({ id: genre.id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	const trpcClient = trpc.useContext()
	return (
		<button
			ref={item}
			className={styles.button}
			type="button"
			onClick={(event) => {
				if (onLong && editOverlay.getValue().type === "genre") {
					onLong()
					return
				}
				navigator.vibrate(1)
				if (onClick) {
					data && onClick(data)
					return
				}
				genre && onSelect?.(genre)
				const element = event.currentTarget
				const { top, left } = element.getBoundingClientRect()
				startTransition(() => {
					openPanel("genre", {
						id: genre.id,
						name: data?.name || genre.name,
						rect: { top, left }
					})
				})
			}}
		>
			{!data?.artists?.length && (
				<div className={styles.empty}>
					{!isSelection && (
						<PlaylistIcon className={styles.icon} />
					)}
				</div>
			)}
			{data?.artists && data.artists.length > 0 && (
				<div className={styles.artists} style={{ "--extra": data.artists.length - 1 } as CSSProperties}>
					{data.artists.map(({ coverId }) => (
						<img
							key={coverId}
							className={styles.cover}
							alt=""
							src={getCoverUrl(coverId, "mini")}
						/>
					))}
				</div>
			)}
			{(isSelection || !available) && (
				<div className={styles.selection}>
					{!isSelection && !available && (
						<OfflineIcon className={styles.icon} />
					)}
					{isSelection && selected && (
						<CheckboxOnIcon className={styles.icon} />
					)}
					{isSelection && !selected && (
						<CheckboxOffIcon className={styles.icon} />
					)}
				</div>
			)}
			<p className={styles.span}>
				<span className={styles.name}>{genre.name}</span>
				<span>{count} track{pluralize(count)}</span>
			</p>
		</button>
	)
}

export default function GenreList ({
	genres,
	onSelect,
	scrollable,
	loading,
	forceAvailable = false,
}: {
	genres: GenreListItem[]
	onSelect?: (genre: GenreListItem) => void
	scrollable?: boolean
	loading?: boolean
	forceAvailable?: boolean
}) {

	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = editViewState.type === "genre"

	const main = useRef<HTMLDivElement>(null)
	// eslint-disable-next-line react-hooks/rules-of-hooks -- `scrollable` never changes once the component is mounted
	const virtualized = scrollable && useVirtualizer({
		count: genres.length,
		horizontal: true,
		overscan: 1,
		paddingStart: 8,
		getScrollElement: () => main.current,
		estimateSize: () => 125,
		getItemKey: (index) => genres[index]!.id,
	})

	if (!virtualized) {
		return (
			<ResizingContainer className={styles.main}>
				{genres.map(genre => (
					<li key={genre.id} className={styles.item}>
						<GenreItem
							genre={genre}
							onSelect={onSelect}
							selected={isSelection && editViewState.selection.some(({ id }) => id === genre.id)}
							isSelection={isSelection}
							forceAvailable={forceAvailable}
						/>
					</li>
				))}
			</ResizingContainer>
		)
	}

	const items = virtualized.getVirtualItems()

	return (
		<div
			ref={main}
			className={classNames(styles.wrapper, styles.scrollable, {
				[styles.loading]: loading,
			})}
		>
			<div style={{ minWidth: virtualized.getTotalSize() }}>
				<ul className={styles.main} style={{ transform: `translateX(${items[0]?.start}px)` }}>
					{items.map(item => (
						<li
							ref={virtualized.measureElement}
							className={styles.item}
							key={item.key}
							data-index={item.index}
						>
							<GenreItem
								genre={genres[item.index]!}
								onSelect={onSelect}
								selected={isSelection && editViewState.selection.some(({ id }) => id === item.key)}
								isSelection={isSelection}
								forceAvailable={forceAvailable}
							/>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

function ResizingContainer ({
	children,
	className,
}: {
	children: ReactNode[]
	className?: string
}) {
	const ref = useRef<HTMLUListElement>(null)
	const [order, setOrder] = useState<number[]>([])
	useEffect(() => {
		if (!ref.current) return
		const element = ref.current
		const resizeObserver = new ResizeObserver(([entry]) => {
			if (!entry) return
			const availableWidth = entry.contentRect.width
			const children = Array.from(element.children)
			if (children.length < 2) return
			const rects = children.map(child => child.getBoundingClientRect())
			const lines = new Set(rects.map(({ y }) => y)).size
			const itemSpacing = rects[1]!.left - rects[0]!.right
			const placed = new Set([0])
			const order = [0]
			let x = rects[0]!.width + itemSpacing
			let newLines = 1
			while (order.length < children.length) {
				const remaining = availableWidth - x
				const found = rects.findIndex(({ width }, i) => width <= remaining && !placed.has(i))
				if (found === -1) {
					const next = rects.findIndex((_, i) => !placed.has(i))
					x = 0
					order.push(next)
					placed.add(next)
					if (order.length < children.length) {
						newLines += 1
					}
				} else {
					x += rects[found]!.width + itemSpacing
					order.push(found)
					placed.add(found)
					if (x >= availableWidth) {
						x = 0
						if (order.length < children.length) {
							newLines += 1
						}
					}
				}
			}
			if (newLines === lines) {
				return
			}
			setOrder(order)
		})
		resizeObserver.observe(element)
		return () => {
			resizeObserver.disconnect()
		}
	}, [])
	return (
		<ul
			ref={ref}
			className={className}
			style={Object.fromEntries(order.map((index, i) => [`--item-order-${index + 1}`, i + 1]))}
		>
			{children}
		</ul>
	)
}