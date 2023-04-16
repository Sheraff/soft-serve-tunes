import classNames from "classnames"
import { type ForwardedRef, forwardRef, startTransition, useRef, useDeferredValue, useImperativeHandle } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import CheckIcon from "icons/done.svg"
import OfflineIcon from "icons/wifi_off.svg"
import { useQueryClient } from "@tanstack/react-query"
import useLongPress from "components/AlbumList/useLongPress"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import { useCachedArtist } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useVirtualizer } from "@tanstack/react-virtual"

type ArtistListItem = {
	id: string
	name: string
}

function ArtistItem ({
	artist,
	onSelect,
	onClick,
	selected,
	selectable,
}: {
	artist: ArtistListItem
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	selected: boolean
	selectable?: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const { data } = trpc.artist.miniature.useQuery({ id: artist.id })

	const isEmpty = data && !data.cover
	const albumCount = data?._count?.albums ?? 0
	const trackCount = data?._count?.tracks ?? 0
	const src = data?.cover ? `/api/cover/${data.cover.id}/${Math.round((393 - 4 * 8) / 3 * 2)}` : undefined

	const queryClient = useQueryClient()

	const onLong = selectable ? () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "artist", id: artist.id }),
			queryClient
		)
	} : undefined
	useLongPress({ onLong, item })

	const online = useIsOnline()
	const { data: cached } = useCachedArtist({ id: artist.id, enabled: !online })
	const offline = !online && cached

	return (
		<button
			ref={item}
			className={classNames(styles.button, {
				[styles.selected]: selected
			})}
			type="button"
			onClick={(event) => {
				if (onLong && editOverlay.getValue(queryClient).type === "artist") {
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
					openPanel("artist", {
						id: artist.id,
						name: data?.name || artist.name,
						rect: { top, left, width, src }
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
						/>
					)}
				</div>
			)}
			<p className={classNames(styles.span, { [styles.empty]: isEmpty })}>
				<span className={styles.name}>{artist.name}</span>
				{!data && <span>&nbsp;</span>}
				{albumCount > 1 && <span>{albumCount} albums</span>}
				{albumCount <= 1 && trackCount > 0 && <span>{trackCount} track{trackCount > 1 ? "s" : ""}</span>}
			</p>
			{selected && <CheckIcon className={styles.check} />}
			{!selected && offline && <OfflineIcon className={styles.check} />}
		</button>
	)
}

export default forwardRef(function ArtistList ({
	artists,
	onSelect,
	onClick,
	lines = 3,
	loading = false,
	selected,
	selectable = true,
}: {
	artists: ArtistListItem[]
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	lines?: 1 | 3
	loading?: boolean
	selected?: string
	selectable?: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = selectable && editViewState.type === "artist"

	const main = useRef<HTMLDivElement>(null)
	const virtualized = useVirtualizer({
		count: artists.length,
		horizontal: true,
		overscan: lines === 1 ? 0 : 3,
		getScrollElement: () => main.current,
		estimateSize: (index) => {
			if (lines === 3 && index % 3 !== 0) return 0
			return (window.innerWidth - 4 * 8) / 3 + 8
		},
		getItemKey: (index) => artists[index]!.id,
	})

	useImperativeHandle(ref, () => main.current!)

	const items = virtualized.getVirtualItems()

	return (
		<div
			className={styles.wrapper}
			ref={main}
		>
			<div style={{ minWidth: virtualized.getTotalSize() }}>
				<ul
					className={classNames(styles.main, styles[`lines-${lines}`], { [styles.loading]: loading })}
					style={{ transform: `translateX(${items[0]?.start}px)` }}
				>
					{items.map((item) => (
						<li className={styles.item} key={item.key} data-index={item.index}>
							<ArtistItem
								artist={artists[item.index]!}
								onSelect={onSelect}
								onClick={onClick}
								selected={selected === item.key || (isSelection && editViewState.selection.some(({ id }) => id === item.key))}
								selectable={selectable}
							/>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
})