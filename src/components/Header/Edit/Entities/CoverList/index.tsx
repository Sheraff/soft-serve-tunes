import { paletteToCSSProperties } from "components/Palette"
import { type CSSProperties } from "react"
import { trpc, type RouterOutputs } from "utils/trpc"
import CheckIcon from "icons/done.svg"
import styles from "./index.module.css"
import classNames from "classnames"

type Cover = RouterOutputs["cover"]["fromTracks"]["covers"][number] | RouterOutputs["cover"]["fromAlbums"]["covers"][number]

export default function CoverList({
	tracks = [],
	albums = [],
	selected,
	onClick,
}: {
	tracks?: string[],
	albums?: string[],
	selected?: string,
	onClick: (cover: Cover) => void,
}) {
	const {data: {covers: trackCovers} = {covers: []}, isLoading: loadingTracks} = trpc.cover.fromTracks.useQuery({ids: tracks}, {enabled: tracks.length > 0})
	const {data: {covers: albumCovers} = {covers: []}, isLoading: loadingAlbums} = trpc.cover.fromAlbums.useQuery({ids: albums}, {enabled: albums.length > 0})
	const covers = [...albumCovers]
	trackCovers.forEach(cover => {
		if (!covers.some(c => c.id === cover.id)) covers.push(cover)
	})
	const {data: selectedCover} = trpc.cover.byId.useQuery({id: selected!}, {
		enabled: Boolean(selected && !loadingTracks && !loadingAlbums && !covers.some(cover => cover.id === selected)),
	})
	if (selectedCover) covers.unshift(selectedCover)

	return (
		<div className={styles.wrapper}>
			<div className={styles.main}>
				{covers.map((cover) => {
					const isSelected = selected === cover.id
					return (
						<div
							key={cover.id}
							className={classNames(styles.cover, {[styles.selected]: isSelected})}
							onClick={() => onClick(cover)}
						>
							<img
								src={`/api/cover/${cover.id}`}
								alt=""
							/>
							<div className={styles.palette} style={paletteToCSSProperties(cover.palette)}>
								<div style={{"--color": "var(--palette-bg-main)"} as CSSProperties}>
									<p>{cover.width}x{cover.height}</p>
								</div>
								<div style={{"--color": "var(--palette-bg-gradient)"} as CSSProperties} />
								<div style={{"--color": "var(--palette-secondary)"} as CSSProperties} />
								<div style={{"--color": "var(--palette-primary)"} as CSSProperties}>
									{isSelected && <CheckIcon />}
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}