import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedPlaylist } from "client/sw/useSWCached"

export function PastSearchPlaylist ({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
	forceAvailable = false,
}: PastSearchProps) {
	const { data: entity } = trpc.playlist.get.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const onClick = () => {
		_onClick?.()
		openPanel("playlist", { id, name: entity?.name })
	}

	const info = []
	if (showType) {
		info.push("Playlist")
	}
	if (entity?._count?.tracks) {
		info.push(`${entity._count.tracks} track${pluralize(entity._count.tracks)}`)
	}

	const online = useIsOnline()
	const { data: cached } = useCachedPlaylist({ id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	return (
		<BasePastSearchItem
			className={styles.list}
			coverId={entity?.albums?.find(a => a.coverId)?.coverId}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="playlist"
			available={available}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
