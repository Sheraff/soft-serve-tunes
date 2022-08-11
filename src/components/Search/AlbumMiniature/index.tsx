import { useMemo } from "react"
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery"
import styles from "./index.module.css"

export default function AlbumMiniature({
	id,
}: {
	id?: string,
}) {
	const {data: album} = useIndexedTRcpQuery(["album.cover", {id: id as string}], {enabled: Boolean(id)})

	const imgSrc = useMemo(() => {
		if (!album) return undefined
		if (album.artist?.audiodb?.cutoutId) return album.artist.audiodb?.cutoutId
		if (album.artist?.audiodb?.thumbId) return album.artist.audiodb?.thumbId
		// if (album.artist?.audiodb?.cutoutId) return album.artist.audiodb?.cutoutId
		// if (album.artist?.audiodb?.cutoutId) return album.artist.audiodb?.cutoutId
		if (album.lastfm?.coverId) return album.lastfm.coverId
		if (album.tracks[0]?.metaImageId) return album.tracks[0].metaImageId
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
			src={imgSrc ? `/api/cover/${imgSrc}` : ""}
			alt=""
			className={styles.img}
			crossOrigin="anonymous"
		/>
	)
}