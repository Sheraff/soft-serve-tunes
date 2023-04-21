import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { type CSSProperties, startTransition, useDeferredValue, useRef } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistIcon from "icons/queue_music.svg"
import CheckboxOnIcon from "icons/check_box_on.svg"
import CheckboxOffIcon from "icons/check_box_off.svg"
import { trpc } from "utils/trpc"
import pluralize from "utils/pluralize"
import useLongPress from "components/AlbumList/useLongPress"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import { autoplay } from "components/Player/Audio"

type GenreListItem = {
	id: string
	name: string
}

function GenreItem ({
	genre,
	onSelect,
	selected,
	isSelection,
}: {
	genre: GenreListItem
	onSelect?: (genre: GenreListItem) => void
	selected?: boolean
	isSelection: boolean
}) {
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	const { data } = trpc.genre.miniature.useQuery({ id: genre.id }, {
		select (data) {
			if (!data?.artists) return data
			return { ...data, artists: data.artists.filter(({ coverId }) => coverId).reverse() }
		}
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

	return (
		<button
			ref={item}
			className={styles.button}
			type="button"
			onClick={() => {
				if (onLong && editOverlay.getValue().type === "genre") {
					onLong()
					return
				}
				navigator.vibrate(1)
				startTransition(() => {
					genre && onSelect?.(genre)
					makePlaylist({ type: "genre", id: genre.id }, genre.name)
					showHome("home")
					autoplay.setState(true)
				})
			}}
		>
			{!isSelection && !data?.artists?.length && (
				<PlaylistIcon className={styles.icon} />
			)}
			{data?.artists && data.artists.length > 0 && (
				<div className={styles.artists} style={{ "--extra": data.artists.length - 1 } as CSSProperties}>
					{data.artists.map(({ coverId }) => (
						<img
							key={coverId}
							className={styles.cover}
							alt=""
							src={`/api/cover/${coverId}/${Math.round(56 * 2)}`}
						/>
					))}
				</div>
			)}
			{isSelection && (
				<div className={styles.selection}>
					{selected && (
						<CheckboxOnIcon className={styles.icon} />
					)}
					{!selected && (
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
}: {
	genres: GenreListItem[]
	onSelect?: (genre: GenreListItem) => void
}) {

	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = editViewState.type === "genre"

	return (
		<ul className={styles.main}>
			{genres?.map(genre => (
				<li key={genre.id} className={styles.item}>
					<GenreItem
						genre={genre}
						onSelect={onSelect}
						selected={isSelection && editViewState.selection.some(({ id }) => id === genre.id)}
						isSelection={isSelection}
					/>
				</li>
			))}
		</ul>
	)
}