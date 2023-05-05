import { type RefObject, useEffect, memo } from "react"
import { nextPlaylistIndex, prevPlaylistIndex, useCurrentTrackDetails } from "client/db/useMakePlaylist"
import { getCoverUrl } from "utils/getCoverUrl"
import { focusManager } from "@tanstack/react-query"

export default memo(function Notification ({
	audio
}: {
	audio: RefObject<HTMLAudioElement>
}) {
	const data = useCurrentTrackDetails()
	const hasData = Boolean(data)

	useEffect(() => {
		if (!data) return

		const sendData = () => {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: data.name,
				artist: data.artist?.name,
				album: data.album?.name,
				...(data.cover?.id ? {
					artwork: [
						{
							src: getCoverUrl(data.cover.id, "full"),
							type: "image/avif",
							sizes: "786x786",
						},
					]
				} : {}),
			})
		}
		sendData()
		const unsubscribe = focusManager.subscribe(() => {
			if (focusManager.isFocused())
				sendData()
		})
		return unsubscribe
	}, [data])

	useEffect(() => {
		if (!hasData) return
		navigator.mediaSession.setActionHandler("previoustrack", () => prevPlaylistIndex())
		navigator.mediaSession.setActionHandler("nexttrack", () => nextPlaylistIndex(audio))
	}, [hasData, audio])

	return null
})