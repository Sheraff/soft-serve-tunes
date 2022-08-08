import { forwardRef, useMemo } from "react"
import { trpc } from "../../utils/trpc"
import styles from "./index.module.css"

export default forwardRef(function Cover({
	id,
}: {
	id: string
}, ref: React.Ref<HTMLImageElement>) {
	const {data: track} = trpc.useQuery(["track.get", {id}], {
		enabled: Boolean(id),
	})
	const {data: lastfm, isLoading: lastfmLoading} = trpc.useQuery(["lastfm.track", {id}], {
		enabled: Boolean(id),
	})

	const imgSrc = useMemo(() => {
		if (!track || lastfmLoading) return undefined
		if (lastfm?.album?.image) {
			const base = lastfm.album.image
			const sizeRegex = /\/i\/u\/([^\/]*)\//
			const src = base.replace(sizeRegex, "/i/u/500x500/")
			return src
		}
		if (track.pictureId) {
			return `/api/cover/${track.pictureId}`
		}
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