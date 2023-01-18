import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import { useQueryClient } from "@tanstack/react-query"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import pluralize from "utils/pluralize"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedAlbum } from "client/sw/useSWCached"

export function PastSearchAlbum({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
}: PastSearchProps) {
	const { data: entity } = trpc.album.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const queryClient = useQueryClient()
	const onClick = () => {
		_onClick?.()
		openPanel("album", { id, name: entity?.name }, queryClient)
	}

	const info = []
	if (showType) {
		info.push("Album")
	}
	if (entity?.artist) {
		info.push(entity.artist.name)
	}
	if (entity?._count?.tracks) {
		info.push(`${entity._count.tracks} track${pluralize(entity._count.tracks)}`)
	}

	const online = useIsOnline()
	const {data: cached} = useCachedAlbum({id, enabled: !online})
	const offline = !online && cached

	return (
		<BasePastSearchItem
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="album"
			offline={offline}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
