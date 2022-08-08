import { useMemo } from "react"
import lastfmImageToUrl from "../../../utils/lastfmImageToUrl"
import { trpc } from "../../../utils/trpc"
import styles from "./index.module.css"

export default function AlbumMiniature({
	id,
}: {
	id: string,
}) {
	const {data: album} = trpc.useQuery(["album.cover", {id}], {enabled: Boolean(id)})

	const imgSrc = useMemo(() => {
		if (!album) return undefined
		if (album.lastfm?.image) return lastfmImageToUrl(album.lastfm?.image, 150)
		if (album.tracks?.[0]?.pictureId) return `/api/cover/${album.tracks?.[0]?.pictureId}`
		return undefined
	}, [album])

	if(album && !imgSrc) return (
		<div className={styles.img}>
			{album.name}
			{album.artist?.name}
		</div>
	)

	return (
		<img
			src={imgSrc}
			alt=""
			className={styles.img}
			crossOrigin="anonymous"
		/>
	)
}