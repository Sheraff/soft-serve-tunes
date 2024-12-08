import classNames from "classnames"
import { type ForwardedRef, forwardRef, startTransition, useRef, useDeferredValue, useImperativeHandle } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import CheckIcon from "icons/done.svg"
import OfflineIcon from "icons/wifi_off.svg"
import useLongPress from "components/AlbumList/useLongPress"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import { useCachedArtist } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual"
import { getCoverUrl } from "utils/getCoverUrl"
import pluralize from "utils/pluralize"
import Image from "atoms/Image"

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
	forceAvailable,
}: {
	artist: ArtistListItem
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	selected: boolean
	selectable?: boolean
	forceAvailable?: boolean
}) {
	const item = useRef<HTMLButtonElement>(null)
	const { data } = trpc.artist.miniature.useQuery({ id: artist.id })

	const isEmpty = data && !data.cover
	const albumCount = data?._count?.albums ?? 0
	const trackCount = (data?._count?.tracks ?? 0) + (data?._count?.feats ?? 0)
	const src = getCoverUrl(data?.cover?.id, "third")

	const onLong = selectable ? () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "artist", id: artist.id })
		)
	} : undefined
	useLongPress({ onLong, item })

	const online = useIsOnline()
	const { data: cached } = useCachedArtist({ id: artist.id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	return (
		<button
			ref={item}
			className={classNames(styles.button, {
				[styles.selected]: selected
			})}
			type="button"
			onClick={(event) => {
				if (onLong && editOverlay.getValue().type === "artist") {
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
					})
				})
			}}
		>
			{!isEmpty && (
				<div className={styles.img}>
					{src && (
						<Image
							cover={data?.cover}
							size="third"
						/>
					)}
				</div>
			)}
			<p className={classNames(styles.span, { [styles.empty]: isEmpty })}>
				<span className={styles.name}>{artist.name}</span>
				{!data && <span>&nbsp;</span>}
				{albumCount > 1 && <span>{albumCount} albums</span>}
				{albumCount <= 1 && trackCount > 0 && <span>{trackCount} track{pluralize(trackCount)}</span>}
			</p>
			{selected && <CheckIcon className={styles.check} />}
			{!selected && !available && <OfflineIcon className={styles.check} />}
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
	forceAvailable = false,
}: {
	artists: ArtistListItem[]
	onSelect?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	onClick?: (artist: Exclude<RouterOutputs["artist"]["miniature"], null>) => void
	lines?: 1 | 3
	loading?: boolean
	selected?: string
	selectable?: boolean
	forceAvailable?: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = selectable && editViewState.type === "artist"

	const main = useRef<HTMLDivElement>(null)
	const virtualized = useVirtualizer({
		count: artists.length,
		horizontal: true,
		overscan: lines,
		getScrollElement: () => main.current,
		estimateSize: (index) => {
			if (lines === 3 && index % 3 !== 0) return 0
			return (window.innerWidth - 4 * 8) / 3 + 8
		},
		rangeExtractor: (range) => {
			if (lines === 1) return defaultRangeExtractor(range)
			range.startIndex = Math.floor(range.startIndex / 3) * 3 - 3
			range.endIndex = Math.ceil(range.endIndex / 3) * 3 + 2
			return defaultRangeExtractor(range)
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
					className={classNames(styles.main, styles.virtualized, styles[`lines-${lines}`], { [styles.loading]: loading })}
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
								forceAvailable={forceAvailable}
							/>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
})