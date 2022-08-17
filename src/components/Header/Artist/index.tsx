import { ForwardedRef, forwardRef, useRef } from "react";
import useIndexedTRcpQuery from "../../../client/db/useIndexedTRcpQuery";
import AlbumList from "../../AlbumList";
import { useAppState } from "../../AppContext";
import styles from "./index.module.css"

export default forwardRef(function ArtistView({
	open,
	id,
}: {
	open: boolean;
	id: string;
}, ref: ForwardedRef<HTMLDivElement>) {
	const {data: _data} = useIndexedTRcpQuery(["artist.get", {id}], {
		enabled: Boolean(id),
		keepPreviousData: true,
	})

	const stableData = useRef(_data)
	stableData.current = _data || stableData.current
	const data = stableData.current

	let imgSrc = ""
	if (data?.spotify?.imageId) {
		imgSrc = data.spotify.imageId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.tracks?.[0]?.metaImageId) {
		imgSrc = data.tracks[0].metaImageId
	}

	const {setAppState, playlist} = useAppState()

	const playlistSetter = playlist && playlist.type === "artist" && playlist.id === id
		? undefined
		: {type: "artist", id, index: 0}

	return (
		<div className={styles.main} data-open={open} ref={ref}>
			<img
				className={styles.img}
				src={imgSrc ? `/api/cover/${imgSrc}` : ""}
				alt=""
			/>
			<p>
				{data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear} · {data?._count.albums} albums · {data?._count.tracks} tracks
			</p>
			<button type="button" onClick={() => setAppState({
				view: {type: "home"},
				playlist: playlistSetter,
			})}>
				play
			</button>
			<div>
				{data?.audiodb?.strBiographyEN}
			</div>
			{data?.albums && Boolean(data.albums.length) && (
				<div>
					<h2 className={styles.sectionTitle}>Albums</h2>
					<AlbumList albums={data.albums} />
				</div>
			)}
		</div>
	)
})