import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { startTransition } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistIcon from "icons/queue_music.svg"
import { trpc } from "utils/trpc"

type GenreListItem = {
	id: string
	name: string
}

function GenreItem({
	genre,
	onSelect,
}: {
	genre: GenreListItem
	onSelect?: (genre: GenreListItem) => void
}) {
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	const {data} = trpc.useQuery(["genre.miniature", {id: genre.id}])

	const count = data?._count.tracks ?? 0

	return (
		<button
			className={styles.button}
			type="button"
			onClick={() => {
				startTransition(() => {
					genre && onSelect?.(genre)
					makePlaylist({type: "genre", id: genre.id}, genre.name)
					showHome("home")
				})
			}}
		>
			<PlaylistIcon className={styles.icon}/>
			<p className={styles.span}>
				<span className={styles.name}>{genre.name}</span>
				<span>{count} track{count > 1 ? "s" : ""}</span>
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
	
	return (
		<ul className={styles.main}>
			{genres?.map(genre => (
				<li key={genre.id} className={styles.item}>
					<GenreItem genre={genre} onSelect={onSelect} />
				</li>
			))}
		</ul>
	)
}