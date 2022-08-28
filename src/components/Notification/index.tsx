import { startTransition, useEffect } from "react"
import { playlist } from "components/AppContext"
import { useCurrentTrackDetails } from "components/AppContext/useCurrentTrack"
import { useSetAtom } from "jotai"

export default function Notification() {
	const data = useCurrentTrackDetails()
	const setPlaylist = useSetAtom(playlist)

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
		if(!data) return

		navigator.mediaSession.setActionHandler('previoustrack', () => {
			startTransition(() => {
				setPlaylist(prev => ({...prev, index: prev.index + 1}))
			})
		})
		navigator.mediaSession.setActionHandler('nexttrack', () => {
			startTransition(() => {
				setPlaylist(prev => ({...prev, index: prev.index - 1}))
			})
		})
	}, [setPlaylist, data])

	return null
}