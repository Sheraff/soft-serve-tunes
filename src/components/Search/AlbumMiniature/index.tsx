import { useMemo } from "react"
import lastfmImageToUrl from "../../../utils/lastfmImageToUrl"
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
		if (album.lastfm?.coverId) return `/api/cover/${album.lastfm.coverId}`
		if (album.tracks[0]?.metaImageId) return `/api/cover/${album.tracks[0].metaImageId}`
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