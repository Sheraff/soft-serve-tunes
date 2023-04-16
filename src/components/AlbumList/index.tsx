import classNames from "classnames"
import { type ForwardedRef, startTransition, useRef, forwardRef, useDeferredValue, useImperativeHandle } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { openPanel } from "components/AppContext"
import CheckIcon from "icons/done.svg"
import OfflineIcon from "icons/wifi_off.svg"
import styles from "./index.module.css"
import { useQueryClient } from "@tanstack/react-query"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import useLongPress from "./useLongPress"
import { useCachedAlbum } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useVirtualizer } from "@tanstack/react-virtual"

type AlbumListItem = {
	id: string
	name?: string
}

function AlbumItem ({
	album,
	onSelect,
	onClick,
	index,
	selected,
	selectable,
}: {
	album: AlbumListItem
	onSelect?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	onClick?: (album: Exclude<RouterOutputs["album"]["miniature"], null>) => void
	index: number
	selected: boolean
	selectable: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const { data } = trpc.album.miniature.useQuery({ id: album.id })

	const isEmpty = !data?.cover
	const trackCount = data?._count?.tracks ?? 0
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round(174.5 * 2)}` : ""

	const queryClient = useQueryClient()

	const onLong = selectable ? () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "album", id: album.id }),
			queryClient
		)
	} : undefined
	useLongPress({ onLong, item })

	const online = useIsOnline()
	const { data: cached } = useCachedAlbum({ id: album.id, enabled: !online })
	const offline = !online && cached

	return (
		<button
			ref={item}
			className={classNames(styles.button, {
				[styles.selected]: selected,
				[styles.withIcon]: selected || offline
			})}
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
				const { top, left, width } = element.getBoundingClientRect()
				startTransition(() => {
					openPanel("album", {
						id: album.id,
						name: data?.name || album.name,
						rect: { top, left, width, src }
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
				{!selected && offline && <OfflineIcon className={styles.icon} />}
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
	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = selectable && editViewState.type === "album"

	const main = useRef<HTMLDivElement>(null)
	// eslint-disable-next-line react-hooks/rules-of-hooks -- `scrollable` never changes once the component is mounted
	const virtualized = scrollable && useVirtualizer({
		count: albums.length,
		horizontal: true,
		overscan: lines === 1 ? 0 : 2,
		getScrollElement: () => main.current,
		estimateSize: (index) => {
			if (lines === 2 && index % 2 !== 0) return 0
			return (window.innerWidth - 3 * 8) / 2 - 10 + 8
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
						className={classNames(styles.main, {
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
									index={item.index}
									selected={selected === item.key || (isSelection && editViewState.selection.some(({ id }) => id === item.key))}
									selectable={selectable}
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
					{albums.map((album, i) => (
						<li className={styles.item} key={album.id}>
							<AlbumItem
								album={album}
								onSelect={onSelect}
								onClick={onClick}
								index={i}
								selected={selected === album.id || (isSelection && editViewState.selection.some(({ id }) => id === album.id))}
								selectable={selectable}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	)
})