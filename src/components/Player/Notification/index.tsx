import { type RefObject, useEffect, memo } from "react"
import { nextPlaylistIndex, prevPlaylistIndex, useCurrentTrackDetails } from "client/db/useMakePlaylist"

export default memo(function Notification ({
	audio
}: {
	audio: RefObject<HTMLAudioElement>
}) {
	const data = useCurrentTrackDetails()
	const hasData = Boolean(data)

	useEffect(() => {
		if (!data) return

		navigator.mediaSession.metadata = new MediaMetadata({
			title: data.name,
			artist: data.artist?.name,
			album: data.album?.name,
			...(data.cover?.id ? {
				artwork: [
					{
						src: `/api/cover/${data.cover.id}`,
						type: "image/avif",
						sizes: "786x786",
					},
				]
			} : {}),
		})
	}, [data])

	useEffect(() => {
		if (!hasData) return
		navigator.mediaSession.setActionHandler("previoustrack", () => prevPlaylistIndex())
		navigator.mediaSession.setActionHandler("nexttrack", () => nextPlaylistIndex(audio))
	}, [hasData, audio])

	return null
})