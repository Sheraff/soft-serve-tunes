import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import { useAtomValue } from "jotai"
import { playlist } from "."

function positiveModulo(value: number, modulo: number) {
	while(value < 0) {
		value += modulo
	}
	return value % modulo
}

export function useCurrentPlaylist() {
	const {type, id} = useAtomValue(playlist)

	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {type, id}], {
		enabled: Boolean(type && id)
	})

	return list
}

export function useCurrentTrack(offset = 0) {
	const {index} = useAtomValue(playlist)
	const list = useCurrentPlaylist()
	
	const item = (!list || !playlist)
		? undefined
		: list[positiveModulo(index + offset, list.length)]

	return item
}

export function useCurrentTrackDetails() {
	const track = useCurrentTrack()

	const { data } = useIndexedTRcpQuery(["track.miniature", {
		id: track?.id as string
	}], {
		enabled: Boolean(track?.id),
	})

	return data
}