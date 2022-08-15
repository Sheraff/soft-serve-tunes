import { useMemo } from "react"
import useIndexedTRcpQuery from "../../../../client/db/useIndexedTRcpQuery"
import styles from "./index.module.css"

export default function AlbumMiniature({
	id,
}: {
	id?: string,
}) {
	const {data: album} = useIndexedTRcpQuery(["album.miniature", {id: id as string}], {enabled: Boolean(id)})

	const imgSrc = useMemo(() => {
		if (!album) return undefined
		if (album.spotify?.imageId) return album.spotify.imageId
		if (album.audiodb?.thumbHqId) return album.audiodb.thumbHqId
		if (album.audiodb?.thumbId) return album.audiodb.thumbId
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