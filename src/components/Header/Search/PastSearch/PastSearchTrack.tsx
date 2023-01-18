import { trpc } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import { useAddNextToPlaylist } from "client/db/useMakePlaylist"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import { useCachedTrack } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"

export function PastSearchTrack({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
}: PastSearchProps) {
	const { data: entity } = trpc.track.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const addNextToPlaylist = useAddNextToPlaylist()
	const showHome = useShowHome()
	const onClick = () => {
		_onClick?.()
		if (!entity)
			return console.warn("PastSearch could not add track to playlist as it was not able to fetch associated data")
		addNextToPlaylist(entity, true)
		showHome("home")
	}

	const info = []
	if (showType) {
		info.push("Track")
	}
	if (entity?.artist) {
		info.push(` by ${entity.artist.name}`)
	}
	if (!entity?.artist && entity?.album) {
		info.push(`from ${entity.album.name}`)
	}

	const online = useIsOnline()
	const {data: cached} = useCachedTrack({id, enabled: !online})
	const offline = !online && cached

	return (
		<BasePastSearchItem
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="track"
			offline={offline}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
