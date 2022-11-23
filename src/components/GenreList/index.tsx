import type { UseQueryResult } from "react-query"
import type { inferQueryOutput } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { startTransition } from "react"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistIcon from "icons/queue_music.svg"

export default function GenreList({
	genres,
	onSelect,
}: {
	genres: UseQueryResult<inferQueryOutput<"genre.list">>["data"]
	onSelect?: (genre: inferQueryOutput<"genre.list">[number]) => void
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