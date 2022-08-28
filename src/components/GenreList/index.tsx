import type { UseQueryResult } from "react-query"
import type { inferQueryOutput } from "utils/trpc"
import { playlist, useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { useSetAtom } from "jotai"
import { startTransition } from "react"

export default function GenreList({
	genres,
	onSelect,
}: {
	genres: UseQueryResult<inferQueryOutput<"genre.list">>["data"]
	onSelect?: (genre: inferQueryOutput<"genre.list">[number]) => void
}) {
	const setPlaylist = useSetAtom(playlist)
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
								setPlaylist({type: "genre", id: genre.id, index: 0})
								showHome("home")
							})
						}}
					>
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