import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { startTransition, useDeferredValue, useRef } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistIcon from "icons/queue_music.svg"
import CheckboxOnIcon from "icons/check_box_on.svg"
import CheckboxOffIcon from "icons/check_box_off.svg"
import { trpc } from "utils/trpc"
import pluralize from "utils/pluralize"
import useLongPress from "components/AlbumList/useLongPress"
import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import { useQueryClient } from "@tanstack/react-query"

type GenreListItem = {
	id: string
	name: string
}

function GenreItem({
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
	const {data} = trpc.genre.miniature.useQuery({id: genre.id})

	const queryClient = useQueryClient()
	const item = useRef<HTMLButtonElement>(null)
	const onLong = () => {
		navigator.vibrate(1)
		editOverlay.setState(
			editOverlaySetter({type: "genre", id: genre.id}),
			queryClient
		)
	}
	useLongPress({onLong, item})

	const count = data?._count.tracks ?? 0

	return (
		<button
			ref={item}
			className={styles.button}
			type="button"
			onClick={() => {
				if (onLong && editOverlay.getValue(queryClient).type === "genre") {
					onLong()
					return
				}
				navigator.vibrate(1)
				startTransition(() => {
					genre && onSelect?.(genre)
					makePlaylist({type: "genre", id: genre.id}, genre.name)
					showHome("home")
				})
			}}
		>
			{isSelection && selected && (
				<CheckboxOnIcon className={styles.icon}/>
				)}
			{isSelection && !selected && (
				<CheckboxOffIcon className={styles.icon}/>
			)}
			{!isSelection && (
				<PlaylistIcon className={styles.icon}/>
			)}
			<p className={styles.span}>
				<span className={styles.name}>{genre.name}</span>
				<span>{count} track{pluralize(count)}</span>
			</p>
		</button>
	)
}

export default function GenreList({
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
						selected={isSelection && editViewState.selection.some(({id}) => id === genre.id)}
						isSelection={isSelection}
					/>
				</li>
			))}
		</ul>
	)
}