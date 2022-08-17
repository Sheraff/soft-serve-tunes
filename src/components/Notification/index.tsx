import { useEffect } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useAppState } from "../AppContext"

export default function Notification() {
	const {playlist, setAppState} = useAppState()

	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = !list || !playlist ? undefined : list[playlist.index]

	const { data } = useIndexedTRcpQuery(["track.miniature", {
		id: item?.id as string
	}], {
		enabled: Boolean(item?.id),
	})

	useEffect(() => {
		if (!data) return

		navigator.mediaSession.metadata = new MediaMetadata({
			title: data.name,
			artist: data.artist?.name,
			album: data.album?.name,
			...(data.coverSrc ? {artwork: [
				{ src: `/api/cover/${data.coverSrc}` },
			]} : {}),
		})
	}, [data])

	useEffect(() => {
		if(!list) return
		navigator.mediaSession.setActionHandler('previoustrack', () => {
			setAppState(({playlist}) => ({
				playlist: {
					index: playlist?.index === undefined ? undefined : (playlist.index - 1 + list.length) % list.length,
				}
			}))
		})
		navigator.mediaSession.setActionHandler('nexttrack', () => {
			setAppState(({playlist}) => ({
				playlist: {
					index: playlist?.index === undefined ? undefined : (playlist.index + 1) % list.length,
				}
			}))
		})
	}, [setAppState, list])

	return null
}