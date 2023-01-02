import { paletteToCSSProperties } from "components/Palette"
import { type CSSProperties } from "react"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

export default function CoverList({
	tracks = [],
	albums = [],
	selected,
}: {
	tracks?: string[],
	albums?: string[],
	selected?: string,
}) {
	const {data: {covers: trackCovers} = {covers: []}} = trpc.cover.fromTracks.useQuery({ids: tracks}, {enabled: tracks.length > 0})
	const {data: {covers: albumCovers} = {covers: []}} = trpc.cover.fromAlbums.useQuery({ids: albums}, {enabled: albums.length > 0})
	const covers = [...trackCovers]
	albumCovers.forEach(cover => {
		if (!covers.some(c => c.id === cover.id)) covers.push(cover)
	})

	return (
		<div className={styles.wrapper}>
			<div className={styles.main}>
				{covers.map((cover) => (
					<div key={cover.id} className={styles.cover}>
						<img
							src={`/api/cover/${cover.id}`}
							alt=""
						/>
						<div className={styles.palette} style={paletteToCSSProperties(cover.palette)}>
							<div style={{'--color': 'var(--palette-bg-main)'} as CSSProperties}>
								<p>{cover.width}x{cover.height}</p>
							</div>
							<div style={{'--color': 'var(--palette-bg-gradient)'} as CSSProperties} />
							<div style={{'--color': 'var(--palette-secondary)'} as CSSProperties} />
							<div style={{'--color': 'var(--palette-primary)'} as CSSProperties} />
						</div>
					</div>
				))}
			</div>
		</div>
	)
}