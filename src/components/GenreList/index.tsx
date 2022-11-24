import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { startTransition } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistIcon from "icons/queue_music.svg"

type GenreListItem = {
	id: string
	name: string
	_count: { tracks: number }
}

export default function GenreList({
	genres,
	onSelect,
}: {
	genres: GenreListItem[]
	onSelect?: (genre: GenreListItem) => void
}) {
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	return (
		<ul className={styles.main}>
			{genres?.map(genre => (
				<li key={genre.id} className={styles.item}>
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
							<span>{genre._count.tracks} track{genre._count.tracks > 1 ? "s" : ""}</span>
						</p>
					</button>
				</li>
			))}
		</ul>
	)
}