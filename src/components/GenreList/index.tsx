import type { UseQueryResult } from "react-query"
import type { inferQueryOutput } from "../../utils/trpc"
import { useRouteParts } from "../RouteContext"
import styles from "./index.module.css"

export default function GenreList({
	genres
}: {
	genres: UseQueryResult<inferQueryOutput<"genre.list">>["data"]
}) {
	const {setRoute} = useRouteParts()
	return (
		<ul className={styles.main}>
			{genres?.map(genre => (
				<li key={genre.id} className={styles.item}>
					<button
						className={styles.button}
						type="button"
						onClick={() => setRoute({type: "genre", id: genre.id, name: genre.name})}
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