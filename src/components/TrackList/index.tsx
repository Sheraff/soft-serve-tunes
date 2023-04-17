import classNames from "classnames"
import {
	type ElementType,
	startTransition,
	useDeferredValue,
	useRef,
	useState,
	useMemo,
	type RefObject,
	type MutableRefObject,
	memo,
	useEffect,
} from "react"
import { type RouterOutputs, trpc } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import styles from "./index.module.css"
import useSlideTrack, { type Callbacks as SlideCallbacks } from "./useSlideTrack"
import FavoriteIcon from "icons/favorite.svg"
import PlaylistNextIcon from "icons/playlist_play.svg"
import PlaylistAddIcon from "icons/playlist_add.svg"
import PlayIcon from "icons/play_arrow.svg"
import DragIcon from "icons/drag_indicator.svg"
import ExplicitIcon from "icons/explicit.svg"
import OfflineIcon from "icons/wifi_off.svg"
import NewIcon from "icons/fiber_new.svg"
import HighIcon from "icons/high_quality.svg"
import CheckboxOnIcon from "icons/check_box_on.svg"
import CheckboxOffIcon from "icons/check_box_off.svg"
import useDragTrack, { type Callbacks as DragCallbacks } from "./useDragTrack"
import { useAddNextToPlaylist } from "client/db/useMakePlaylist"
import AddToPlaylist from "./AddToPlaylist"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedTrack } from "client/sw/useSWCached"
import { useQueryClient } from "@tanstack/react-query"
import { type VirtualItem, useVirtualizer } from "@tanstack/react-virtual"

const emptyFunction = () => { }

type TrackListItem = {
	id: string
	name: string
}

const TrackItem = memo(function _TrackItem ({
	track,
	current,
	onClick,
	onSelect,
	draggable,
	onAdd,
	onNext,
	quickSwipeIcon,
	quickSwipeDeleteAnim,
	index,
	selection,
	selected,
}: {
	track: TrackListItem
	current?: boolean
	onClick?: (id: string, name: string) => void
	onSelect?: (track: Exclude<RouterOutputs["track"]["miniature"], null>) => void
	draggable?: boolean
	onAdd?: (track: TrackListItem) => void
	onNext?: (track: Exclude<RouterOutputs["track"]["miniature"], undefined | null>) => void
	quickSwipeIcon?: ElementType
	quickSwipeDeleteAnim?: boolean
	index: number
	selection: boolean
	selected: boolean
}) {
	const item = useRef<HTMLDivElement>(null)
	const { data } = trpc.track.miniature.useQuery({ id: track.id })

	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()

	const isEmpty = !data?.cover

	const { mutate: likeMutation } = trpc.track.like.useMutation()
	const callbacks = useRef<SlideCallbacks>({
		onLike: emptyFunction,
		onAdd: emptyFunction,
		onNext: emptyFunction,
		onLong: emptyFunction,
	})
	callbacks.current.onLike = () => {
		likeMutation({
			id: track.id,
			toggle: !data?.userData?.favorite,
		})
	}
	callbacks.current.onAdd = () => {
		onAdd?.(track)
	}
	callbacks.current.onNext = () => {
		if (data)
			onNext?.(data)
	}
	const queryClient = useQueryClient()
	callbacks.current.onLong = () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({ type: "track", id: track.id }),
			queryClient
		)
	}
	useSlideTrack(item, callbacks, { quickSwipeDeleteAnim })

	const NextIcon = quickSwipeIcon || PlaylistNextIcon

	const position = data?.position ?? null
	const explicit = Boolean(data?.spotify?.explicit)
	const recent = useMemo(
		() => data?.createdAt && Date.now() - 3 * 24 * 60 * 60 * 1000 < data.createdAt.getTime(),
		[data?.createdAt]
	)
	const online = useIsOnline()
	const { data: cached } = useCachedTrack({ id: track.id, enabled: !online })
	const offline = !online && cached
	const high = data?.file?.container.toUpperCase() === "FLAC"

	return (
		<div ref={item} className={classNames(styles.wrapper, {
			[styles.liked]: data?.userData?.favorite,
			[styles.draggable]: draggable,
			[styles.selection]: selection,
		})}>
			<button
				className={classNames(styles.button, {
					[styles.empty]: isEmpty,
				})}
				type="button"
				onClick={() => {
					if (editOverlay.getValue(queryClient).type === "track") {
						callbacks.current.onLong!()
						return
					}
					navigator.vibrate(1)
					data && onSelect?.(data)
					if (onClick) {
						onClick(track.id, track.name)
						return
					}
					if (data) {
						startTransition(() => {
							addNextToPlaylist(data, true)
							showHome("home")
						})
						return
					}
					console.error("Tried to add track to playlist, but data was not loaded yet")
				}}
			>
				{!selection && draggable && (
					<DragIcon className={styles.handle} data-handle />
				)}
				{selection && !selected && (
					<CheckboxOffIcon className={styles.selected} />
				)}
				{selection && selected && (
					<CheckboxOnIcon className={styles.selected} />
				)}
				{!isEmpty && (
					<div className={styles.img}>
						<img
							src={`/api/cover/${data.cover?.id}/${Math.round(48 * 2)}`}
							alt=""
							loading={index > 4 ? "lazy" : undefined}
							decoding={index > 4 ? "async" : undefined}
						/>
					</div>
				)}
				{current && (
					<div className={styles.play}>
						<PlayIcon />
					</div>
				)}
				<p className={styles.span}>
					<span className={styles.name}>
						{position !== null && (
							`${position.toString().padStart(2, "0")} · `
						)}
						{data?.name}
					</span>
					{data?.album?.name && <span className={styles.credits}>{data?.album.name}</span>}
					{data?.artist?.name && <span className={styles.credits}>{data?.artist.name}</span>}
					{(explicit || offline || recent || high) && (
						<span className={styles.icons}>
							<>
								{offline && <OfflineIcon key="offline" className={styles.offline} />}
								{high && <HighIcon key="high" />}
								{recent && <NewIcon key="recent" />}
								{explicit && <ExplicitIcon key="explicit" className={styles.explicit} />}
							</>
						</span>
					)}
				</p>
			</button>
			<FavoriteIcon className={styles.fav} />
			<div className={styles.playlist}>
				<NextIcon className={styles.next} />
				<PlaylistAddIcon className={styles.add} />
			</div>
		</div>
	)
})

export function useVirtualTracks<T extends { id: string }[]> ({
	virtual,
	parent,
	orderable,
	tracks,
	exposeScrollFn,
}: {
	virtual?: boolean
	parent: RefObject<HTMLElement>
	orderable?: boolean
	tracks: T
	exposeScrollFn?: boolean
}) {
	const staticOrderable = useRef(orderable)
	// eslint-disable-next-line react-hooks/rules-of-hooks -- this should be OK as `orderable` doesn't change once a component is mounted
	const deferredTracks = staticOrderable.current ? tracks : useDeferredValue(tracks)

	const forceInsertVirtualDragItem = useRef<number | null>(null)
	const forwardOverScan = 1 //2 // numbers to use without innerWidth offsets
	const backwardOverScan = 1 //10 // numbers to use without innerWidth offsets
	const weirdAdjust = virtual ? window.innerWidth : 0
	// eslint-disable-next-line react-hooks/rules-of-hooks -- this should be OK as `virtual` doesn't change once a component is mounted
	const rowVirtualizer = virtual && useVirtualizer({
		count: tracks.length,
		getScrollElement: () => parent?.current,
		estimateSize: () => 65, // calc(48px + 2 * 8px + 1px)
		getItemKey: (index) => tracks[index]!.id,
		rangeExtractor: (range) => {
			const extra = forceInsertVirtualDragItem.current
			if (extra !== null && range.startIndex - backwardOverScan > extra) {
				range.startIndex = extra + backwardOverScan
			} else if (extra !== null && range.endIndex + forwardOverScan <= extra) {
				range.endIndex = extra - forwardOverScan + 1
			}
			const max = Math.min(range.endIndex + forwardOverScan, range.count)
			const min = Math.max(range.startIndex - backwardOverScan, 0)
			const length = max - min
			return Array.from(Array(length), (_, i) => min + i)
		},
		paddingStart: weirdAdjust,
		paddingEnd: -weirdAdjust,
	})

	if (exposeScrollFn) {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- this should be OK as `exposeScrollFn` doesn't change once a component is mounted
		useEffect(() => {
			// @ts-expect-error -- this is a hack to expose the scroll function
			window._scrollNowPlayingToIndex = (index: number) => {
				parent.current?.scrollTo({
					top: index * 65,
					behavior: "smooth",
				})
			}
			return () => {
				// @ts-expect-error -- this is a hack to expose the scroll function
				window._scrollNowPlayingToIndex = undefined
			}
		}, [parent])
	}
	const items = rowVirtualizer ? rowVirtualizer.getVirtualItems() : undefined
	return {
		virtualTop: items ? (items[0]?.start ?? 0) - weirdAdjust : 0,
		virtualizer: items
			? (callback: (item: VirtualItem) => JSX.Element) => items.map(callback)
			: undefined,
		getParentHeight: rowVirtualizer
			? rowVirtualizer.getTotalSize
			: undefined,
		tracks: deferredTracks,
		orderable,
		forceInsertVirtualDragItem,
	}
}

export default function TrackList ({
	tracks,
	current,
	onClick,
	onSelect,
	orderable,
	onReorder,
	quickSwipeAction,
	quickSwipeIcon,
	quickSwipeDeleteAnim,
	virtualizer,
	getParentHeight,
	forceInsertVirtualDragItem,
	virtualTop,
}: {
	tracks: TrackListItem[]
	current?: string
	onClick?: Parameters<typeof TrackItem>[0]["onClick"]
	onSelect?: (track: Exclude<RouterOutputs["track"]["miniature"], null>) => void
	orderable?: boolean
	onReorder?: (from: number, to: number) => void
	quickSwipeAction?: (track: Exclude<RouterOutputs["track"]["miniature"], null>) => void
	quickSwipeIcon?: ElementType
	quickSwipeDeleteAnim?: boolean
	virtualizer?: (callback: (item: VirtualItem) => JSX.Element) => JSX.Element[]
	getParentHeight?: () => number
	forceInsertVirtualDragItem?: MutableRefObject<number | null>
	virtualTop?: number
}) {
	const ref = useRef<HTMLUListElement>(null)
	const callbacks = useRef<DragCallbacks>({
		onDrop: emptyFunction
	})
	callbacks.current.onDrop = (from, to) => {
		if (onReorder) {
			navigator.vibrate(1)
			onReorder(from, to)
		}
	}
	useDragTrack(ref, !!orderable, callbacks, tracks.length, forceInsertVirtualDragItem)
	const addNextToPlaylist = useAddNextToPlaylist()

	const [itemToAdd, setItemToAdd] = useState<TrackListItem | null>(null)

	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = editViewState.type === "track"

	return (
		<>
			<AddToPlaylist item={itemToAdd} setItem={setItemToAdd} />
			<ul
				ref={orderable ? ref : undefined}
				className={classNames(styles.main, { [styles.virtualized]: Boolean(virtualizer) })}
				style={getParentHeight && {
					minHeight: `${getParentHeight()}px`,
				}}
			>
				{virtualizer && (
					<div style={{ transform: `translateY(${virtualTop}px)` }} >
						{virtualizer((virtualItem) => (
							<li
								className={styles.item}
								key={virtualItem.key}
								data-index={virtualItem.index}
							>
								<TrackItem
									track={tracks[virtualItem.index]!}
									current={current === tracks[virtualItem.index]!.id}
									onClick={onClick}
									onSelect={onSelect}
									draggable={orderable}
									onAdd={setItemToAdd}
									onNext={quickSwipeAction || addNextToPlaylist}
									quickSwipeIcon={quickSwipeIcon}
									quickSwipeDeleteAnim={quickSwipeDeleteAnim}
									index={virtualItem.index}
									selection={isSelection}
									selected={isSelection && editViewState.selection.some(({ id }) => id === tracks[virtualItem.index]!.id)}
								/>
							</li>
						))}
					</div>
				)}
				{!virtualizer && tracks.map((track, i) => (
					<li
						className={styles.item}
						key={track.id}
						data-index={i}
					>
						<TrackItem
							track={track}
							current={current === track.id}
							onClick={onClick}
							onSelect={onSelect}
							draggable={orderable}
							onAdd={setItemToAdd}
							onNext={quickSwipeAction || addNextToPlaylist}
							quickSwipeIcon={quickSwipeIcon}
							quickSwipeDeleteAnim={quickSwipeDeleteAnim}
							index={i}
							selection={isSelection}
							selected={isSelection && editViewState.selection.some(({ id }) => id === track.id)}
						/>
					</li>
				))}
			</ul>
		</>
	)
}