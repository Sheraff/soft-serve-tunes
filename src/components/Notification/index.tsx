import { useEffect } from "react"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { useRouteParts } from "../RouteContext"

export default function Notification() {
	const {type, id, index, setIndex} = useRouteParts()

	const { data: list } = useIndexedTRcpQuery(["playlist.generate", { type, id }], {
		enabled: Boolean(type && id)
	})

	const item = list?.[index]

	const { data } = useIndexedTRcpQuery(["track.miniature", { id: item?.id }], {
		enabled: Boolean(item),
	})

	let imgSrc = ""
	if (data?.spotify?.album?.imageId) {
		imgSrc = data.spotify.album?.imageId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.audiodb?.album.thumbHqId) {
		imgSrc = data.audiodb.album.thumbHqId
	} else if (data?.audiodb?.album.thumbId) {
		imgSrc = data.audiodb.album.thumbId
	} else if (data?.lastfm?.album?.coverId) {
		imgSrc = data.lastfm.album.coverId
	} else if (data?.metaImageId) {
		imgSrc = data.metaImageId
	}

	useEffect(() => {
		if (!data) return
		navigator.mediaSession.metadata = new MediaMetadata({
			title: data.name,
			artist: data.artist?.name,
			album: data.album?.name,
			...(imgSrc ? {artwork: [
				{ src: `/api/cover/${imgSrc}` },
			]} : {}),
		})
	}, [data, imgSrc])

	useEffect(() => {
		if(!list) return
		navigator.mediaSession.setActionHandler('previoustrack', () => {
			setIndex((index) => (index - 1 + list.length) % list.length)
		})
		navigator.mediaSession.setActionHandler('nexttrack', () => {
			setIndex((index) => (index + 1) % list.length)
		})
	}, [setIndex, list])

	return null
}