import { forwardRef, useMemo } from "react"
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

	const imgSrc = useMemo(() => {
		if (!track || lastfmLoading) return undefined
		if (lastfm?.album?.image) return lastfmImageToUrl(lastfm.album.image)
		if (track.pictureId) return `/api/cover/${track.pictureId}`
		return undefined
	}, [track, lastfm, lastfmLoading])

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