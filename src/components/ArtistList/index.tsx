import type { Artist } from "@prisma/client"
import styles from "./index.module.css"

function ArtistItem({artist}: {artist: Artist}) {
	return (
		<li className={styles.item}>
			{artist.name}
		</li>
	)
}

export default function ArtistList({
	artists
}: {
	artists: Artist[]
}) {
	return (
		<div className={styles.wrapper}>
			<ul className={styles.main}>
				{artists.map(artist => (
					<ArtistItem
						key={artist.id}
						artist={artist}
					/>
				))}
			</ul>
		</div>
	)
}