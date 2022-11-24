import classNames from "classnames"
import { ElementType, startTransition, useDeferredValue, useEffect, useRef, useState } from "react"
import { type inferQueryOutput, trpc } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import useSlideTrack, { type Callbacks as SlideCallbacks } from "./useSlideTrack"
import FavoriteIcon from "icons/favorite.svg"
import PlaylistNextIcon from "icons/playlist_play.svg"
import PlaylistAddIcon from "icons/playlist_add.svg"
import PlayIcon from "icons/play_arrow.svg"
import DragIcon from "icons/drag_indicator.svg"
import useDragTrack, { type Callbacks as DragCallbacks } from "./useDragTrack"
import { useAddNextToPlaylist } from "client/db/useMakePlaylist"

const emptyFunction = () => {}

type TrackListItem = {
	id: string
	name: string
}

function TrackItem({
	track,
	enableSiblings,
	current,
	onClick,
	onSelect,
	draggable,
	onNext,
	quickSwipeIcon,
	quickSwipeDeleteAnim,
	index,
}: {
	track: TrackListItem
	enableSiblings?: () => void
	current?: boolean
	onClick?: (id:string, name:string) => void
	onSelect?: (track: Exclude<inferQueryOutput<"track.miniature">, null>) => void
	draggable?: boolean
	onNext?: (track: Exclude<inferQueryOutput<"track.miniature">, undefined | null>) => void
	quickSwipeIcon?: ElementType
	quickSwipeDeleteAnim?: boolean
	index: number
}) {
	const item = useRef<HTMLDivElement>(null)
	const {data} = trpc.useQuery(["track.miniature", {id: track.id}])

	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()
	
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

	const {mutate: likeMutation} = trpc.useMutation(["track.like"])
	const callbacks = useRef<SlideCallbacks>({
		onLike: emptyFunction,
		onAdd: emptyFunction,
		onNext: emptyFunction,
	})
	callbacks.current.onLike = () => {
		likeMutation({
			id: track.id,
			toggle: !data?.userData?.favorite,
		})
	}
	callbacks.current.onAdd = () => {
		console.log('add')
	}
	callbacks.current.onNext = () => {
		if (data)
			onNext?.(data)
	}
	useSlideTrack(item, callbacks, {quickSwipeDeleteAnim})

	const position = data?.position ?? data?.spotify?.trackNumber ?? data?.audiodb?.intTrackNumber ?? false

	const NextIcon = quickSwipeIcon || PlaylistNextIcon

	return (
		<div ref={item} className={classNames(styles.wrapper, {
			[styles.liked]: data?.userData?.favorite,
			[styles.draggable]: draggable,
		})}>
			<button
				className={classNames(styles.button, {
					[styles.empty]: isEmpty,
				})}
				type="button"
				onClick={() => {
					data && onSelect?.(data)
					if (onClick) {
						onClick(track.id, track.name)
					} else if (data) {
						startTransition(() => {
							addNextToPlaylist(data, true)
							showHome("home")
						})
					} else {
						console.error('Tried to add track to playlist, but data was not loaded yet')
					}
				}}
			>
				{draggable && (
					<DragIcon className={styles.handle} data-handle/>
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
						{/* TODO: not always show `position`, only if relevant (in album view, or in playlist of album) */}
						{position !== false && (
							`${position.toString().padStart(2, '0')} · `
						)}
						{data?.name}
					</span>
					{data?.album?.name && <span>{data?.album.name}</span>}
					{data?.artist?.name && <span>{data?.artist.name}</span>}
				</p>
			</button>
			<FavoriteIcon className={styles.fav} />
			<div className={styles.playlist}>
				<NextIcon className={styles.next} />
				<PlaylistAddIcon className={styles.add} />
			</div>
		</div>
	)
}

export default function TrackList({
	tracks,
	current,
	onClick,
	onSelect,
	orderable,
	onReorder,
	quickSwipeAction,
	quickSwipeIcon,
	quickSwipeDeleteAnim,
}: {
	tracks: TrackListItem[]
	current?: string
	onClick?: Parameters<typeof TrackItem>[0]["onClick"]
	onSelect?: (track: Exclude<inferQueryOutput<"track.miniature">, null>) => void
	orderable?: boolean
	onReorder?: (from: number, to: number) => void
	quickSwipeAction?: (track: Exclude<inferQueryOutput<"track.miniature">, null>) => void
	quickSwipeIcon?: ElementType
	quickSwipeDeleteAnim?: boolean
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)
	const ref = useRef<HTMLUListElement>(null)
	const callbacks = useRef<DragCallbacks>({
		onDrop: emptyFunction
	})
	callbacks.current.onDrop = (from, to) => {
		onReorder?.(from, to)
	}
	useDragTrack(ref, !!orderable, callbacks)
	const addNextToPlaylist = useAddNextToPlaylist()

	const staticOrderable = useRef(orderable)
	// eslint-disable-next-line react-hooks/rules-of-hooks -- this should be OK as `orderable` doesn't change once a component is mounted
	const deferredTracks = staticOrderable.current ? tracks : useDeferredValue(tracks)

	return (
		<ul className={styles.main} ref={orderable ? ref : undefined}>
			{deferredTracks.map((track, i) => (
				<li className={styles.item} key={track.id} data-index={i}>
					{i <= enableUpTo && (
						<TrackItem
							track={track}
							enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
							current={current === track.id}
							onClick={onClick}
							onSelect={onSelect}
							draggable={orderable}
							onNext={quickSwipeAction || addNextToPlaylist}
							quickSwipeIcon={quickSwipeIcon}
							quickSwipeDeleteAnim={quickSwipeDeleteAnim}
							index={i}
						/>
					)}
				</li>
			))}
		</ul>
	)
}