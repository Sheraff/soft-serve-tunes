import { usePastSearchesMutation, useRemoveFromPastSearches } from "client/db/indexedPastSearches"
import { PastSearchArtist } from "./PastSearchArtist"
import { PastSearchAlbum } from "./PastSearchAlbum"
import { PastSearchGenre } from "./PastSearchGenre"
import { PastSearchPlaylist } from "./PastSearchPlaylist"
import { PastSearchTrack } from "./PastSearchTrack"

const PAST_SEARCH_COMPONENTS = {
	artist: PastSearchArtist,
	album: PastSearchAlbum,
	genre: PastSearchGenre,
	playlist: PastSearchPlaylist,
	track: PastSearchTrack,
}

export default function PastSearch ({
	id,
	type,
}: {
	id: string
	type: keyof typeof PAST_SEARCH_COMPONENTS
}) {
	const { mutate: deletePastSearch } = useRemoveFromPastSearches()
	const onSettled = (data: boolean) => {
		if (data) return
		deletePastSearch({ id })
	}
	const { mutate: onSelect } = usePastSearchesMutation()
	const onClick = () => {
		setTimeout(() => {
			onSelect({ id, type })
		}, 1_000)
	}
	const Component = PAST_SEARCH_COMPONENTS[type]
	return <Component id={id} onSettled={onSettled} onClick={onClick} />
}
