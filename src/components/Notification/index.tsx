import { useEffect } from "react"
import { useCurrentTrackDetails, useSetPlaylistIndex } from "client/db/useMakePlaylist"

export default function Notification() {
	const data = useCurrentTrackDetails()
	const {nextPlaylistIndex, prevPlaylistIndex} = useSetPlaylistIndex()
	const hasData = Boolean(data)

	useEffect(() => {
		if (!data) return

		navigator.mediaSession.metadata = new MediaMetadata({
			title: data.name,
			artist: data.artist?.name,
			album: data.album?.name,
			...(data.cover?.id ? {artwork: [
				{ src: `/api/cover/${data.cover.id}`, type: "image/avif" },
			]} : {}),
		})
	}, [data])

	useEffect(() => {
		if(!hasData) return

		navigator.mediaSession.setActionHandler('previoustrack', prevPlaylistIndex)
		navigator.mediaSession.setActionHandler('nexttrack', nextPlaylistIndex)
	}, [hasData, prevPlaylistIndex, nextPlaylistIndex])

	return null
}