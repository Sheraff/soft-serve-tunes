import { forwardRef, useMemo, useRef } from "react"
import lastfmImageToUrl from "../../utils/lastfmImageToUrl"
import { trpc } from "../../utils/trpc"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import styles from "./index.module.css"

export default forwardRef(function Cover({
	id,
}: {
	id: string | undefined,
}, ref: React.Ref<HTMLImageElement>) {
	const {data: track} = useIndexedTRcpQuery(["track.get", {id: id as string}], {
		enabled: Boolean(id),
	})
	const {data: lastfm, isLoading: lastfmLoading} = trpc.useQuery(["lastfm.track", {id: id as string}], {
		enabled: Boolean(id),
	})
	const {data: audiodb, isLoading: audiodbLoading} = trpc.useQuery(["audiodb.get.artist", {id: track?.artistId as string}], {
		enabled: Boolean(track?.artistId),
	})
	const {data: audiodbT, isLoading: audiodbTLoading} = trpc.useQuery(["audiodb.get.track", {id: id as string}], {
		enabled: Boolean(id),
	})

	const previous = useRef<string | undefined>(undefined)
	const imgSrc = useMemo(() => {
		if (!track || lastfmLoading || audiodbLoading || audiodbTLoading) return previous.current
		if (audiodbT?.audiodb?.thumbId) return `/api/cover/${audiodbT.audiodb.thumbId}`
		if (lastfm?.album?.coverId) return `/api/cover/${lastfm.album.coverId}`
		if (track.metaImageId) return `/api/cover/${track.metaImageId}`
		if (audiodb?.audiodb?.thumbId) return `/api/cover/${audiodb.audiodb?.thumbId}`
		// if (audiodb?.audiodb?.cutoutId) return `/api/cover/${audiodb.audiodb?.cutoutId}`
		return undefined
	}, [track, lastfm, audiodb, audiodbT, lastfmLoading, audiodbLoading, audiodbTLoading])
	// previous.current = imgSrc
	return (
		<img
			className={styles.img}
			src={imgSrc}
			alt=""
			ref={ref}
			crossOrigin="anonymous"
		/>
	)
})