import classNames from "classnames"
import { type ForwardedRef, startTransition, useRef, forwardRef, useDeferredValue, useImperativeHandle } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { openPanel } from "components/AppContext"
import CheckIcon from "icons/done.svg"
import OfflineIcon from "icons/wifi_off.svg"
import styles from "./index.module.css"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import useLongPress from "./useLongPress"
import { useCachedAlbum } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import { getCoverUrl } from "utils/getCoverUrl"
import pluralize from "utils/pluralize"
import Image from "atoms/Image"

type AlbumListItem = {
	id: string
	name?: string
}

function AlbumItem ({
	album,
	onSelect,
	onClick,
	selected,
	selectable,
	forceAvailable,
}: {
	album: AlbumListItem
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	onClick?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	selected: boolean
	selectable: boolean
	forceAvailable?: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const { data } = trpc.album.miniature.useQuery({ id: album.id })

	const isEmpty = !data?.cover
	const trackCount = data?._count?.tracks ?? 0
	const src = getCoverUrl(data?.cover?.id, "half")

	const onLong = selectable ? () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "album", id: album.id })
		)
	} : undefined
	useLongPress({ onLong, item })

	const online = useIsOnline()
	const { data: cached } = useCachedAlbum({ id: album.id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	return (
		<button
			ref={item}
			className={classNames(styles.button, {
				[styles.selected]: selected,
				[styles.withIcon]: selected || !available
			})}
			type="button"
			onClick={(event) => {
				if (onLong && editOverlay.getValue().type === "album") {
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
				const { top, left, width } = element.getBoundingClientRect()
				startTransition(() => {
					openPanel("album", {
						id: album.id,
						name: data?.name || album.name,
						rect: { top, left, width, src }
					})
				})
			}}
		>
			{!isEmpty && (
				<Image
					cover={data?.cover}
					size="half"
				/>
			)}
			<p className={classNames(styles.span, {
				[styles.empty]: isEmpty,
				[styles.two]: !data?.artist?.name,
			})}>
				<span className={styles.name}>{data?.name || album.name}</span>
				{data?.artist?.name && <span>{data?.artist?.name}</span>}
				<span>{trackCount} track{pluralize(trackCount)}</span>
				{selected && <CheckIcon className={styles.icon} />}
				{!selected && !available && <OfflineIcon className={styles.icon} />}
			</p>
		</button>
	)
}

export default forwardRef(function AlbumList ({
	albums,
	onSelect,
	onClick,
	scrollable = false,
	lines = 2,
	loading = false,
	selected,
	selectable = true,
	forceAvailable = false,
}: {
	albums: AlbumListItem[]
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	onClick?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	scrollable?: boolean
	lines?: 1 | 2
	loading?: boolean
	selected?: string
	selectable?: boolean
	forceAvailable?: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = selectable && editViewState.type === "album"

	const main = useRef<HTMLDivElement>(null)
	// eslint-disable-next-line react-hooks/rules-of-hooks -- `scrollable` never changes once the component is mounted
	const virtualized = scrollable && useVirtualizer({
		count: albums.length,
		horizontal: true,
		overscan: lines,
		paddingStart: 8,
		getScrollElement: () => main.current,
		estimateSize: (index) => {
			if (lines === 2 && index % 2 !== 0) return 0
			return (window.innerWidth - 3 * 8) / 2 - 10 + 8
		},
		rangeExtractor: (range) => {
			if (lines === 1) return defaultRangeExtractor(range)
			range.startIndex = Math.floor(range.startIndex / 2) * 2
			range.endIndex = Math.ceil(range.endIndex / 2) * 2 + 1
			return defaultRangeExtractor(range)
		},
		getItemKey: (index) => albums[index]!.id,
	})

	useImperativeHandle(ref, () => main.current!)

	const items = virtualized && virtualized.getVirtualItems()

	return (
		<div className={classNames(styles.wrapper, { [styles.scrollable]: scrollable })} ref={main}>
			{virtualized && items && (
				<div style={{ minWidth: virtualized.getTotalSize() }}>
					<ul
						className={classNames(styles.main, styles.virtualized, {
							[styles.loading]: loading,
							[styles["lines-2"]]: lines === 2,
						})}
						style={{ transform: `translateX(${items[0]?.start}px)` }}
					>
						{items.map((item) => (
							<li className={styles.item} key={item.key} data-index={item.index}>
								<AlbumItem
									album={albums[item.index]!}
									onSelect={onSelect}
									onClick={onClick}
									selected={selected === item.key || (isSelection && editViewState.selection.some(({ id }) => id === item.key))}
									selectable={selectable}
									forceAvailable={forceAvailable}
								/>
							</li>
						))}
					</ul>
				</div>
			)}
			{!virtualized && (
				<ul className={
					classNames(styles.main, {
						[styles.loading]: loading,
						[styles["lines-2"]]: lines === 2,
					})
				}>
					{albums.map((album) => (
						<li className={styles.item} key={album.id}>
							<AlbumItem
								album={album}
								onSelect={onSelect}
								onClick={onClick}
								selected={selected === album.id || (isSelection && editViewState.selection.some(({ id }) => id === album.id))}
								selectable={selectable}
								forceAvailable={forceAvailable}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	)
})