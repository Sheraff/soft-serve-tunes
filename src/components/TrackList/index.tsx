import classNames from "classnames"
import { startTransition, useEffect, useRef, useState } from "react"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import { inferQueryOutput } from "utils/trpc"
import { playlist, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import useSlideTrack, { Callbacks as SlideCallbacks } from "./useSlideTrack"
import FavoriteIcon from "icons/favorite.svg"
import PlaylistNextIcon from "icons/playlist_play.svg"
import PlaylistAddIcon from "icons/playlist_add.svg"
import PlayIcon from "icons/play_arrow.svg"
import DragIcon from "icons/drag_indicator.svg"
import { useSetAtom } from "jotai"
import { trpc } from "utils/trpc"
import useDragTrack, { Callbacks as DragCallbacks } from "./useDragTrack"

const emptyFunction = () => {}

function TrackItem({
	track,
	enableSiblings,
	current,
	onClick,
	onSelect,
	draggable,
}: {
	track: inferQueryOutput<"track.searchable">[number]
	enableSiblings?: () => void
	current?: boolean
	onClick?: (id:string, name:string) => void
	onSelect?: (track: inferQueryOutput<"track.miniature">) => void
	draggable?: boolean
}) {
	const item = useRef<HTMLDivElement>(null)
	const {data} = useIndexedTRcpQuery(["track.miniature", {id: track.id}])

	const setPlaylist = useSetAtom(playlist)
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
		console.log('next')
	}
	useSlideTrack(item, callbacks)

	const position = data?.position ?? data?.spotify?.trackNumber ?? data?.audiodb?.intTrackNumber ?? false

	return (
		<div ref={item} className={classNames(styles.wrapper, {
			[styles.liked as string]: data?.userData?.favorite,
			[styles.draggable as string]: draggable,
		})}>
			<button
				className={classNames(styles.button, {
					[styles.empty as string]: isEmpty,
					[styles.current as string]: current,
				})}
				type="button"
				onClick={() => {
					data && onSelect?.(data)
					if (onClick) {
						onClick(track.id, track.name)
					} else {
						startTransition(() => {
							setPlaylist({type: "track", id: track.id, index: 0})
							showHome("home")
						})
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
						/>
					</div>
				)}
				{current && (
					<PlayIcon className={styles.play}/>
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
				<PlaylistNextIcon className={styles.next} />
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
}: {
	tracks: inferQueryOutput<"track.searchable">
	current?: string
	onClick?: Parameters<typeof TrackItem>[0]["onClick"]
	onSelect?: (track: Exclude<inferQueryOutput<"track.miniature">, null>) => void
	orderable?: boolean
	onReorder?: (from: number, to: number) => void
}) {
	const [enableUpTo, setEnableUpTo] = useState(12)
	const ref = useRef<HTMLUListElement>(null)
	const callbacks = useRef<DragCallbacks>({
		onDrop: emptyFunction
	})
	callbacks.current.onDrop = (from, to) => {
		onReorder?.(from, to)
		console.log('reorder tracks', from, to)
	}
	useDragTrack(ref, !!orderable, callbacks)
	return (
		<ul className={styles.main} ref={orderable ? ref : undefined}>
			{tracks.map((track, i) => (
				<li className={styles.item} key={track.id} data-index={i}>
					{i <= enableUpTo && (
						<TrackItem
							track={track}
							enableSiblings={i === enableUpTo ? () => setEnableUpTo(enableUpTo + 12) : undefined}
							current={current === track.id}
							onClick={onClick}
							onSelect={onSelect}
							draggable={orderable}
						/>
					)}
				</li>
			))}
		</ul>
	)
}