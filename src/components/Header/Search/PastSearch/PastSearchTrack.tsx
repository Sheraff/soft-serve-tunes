import { trpc } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import { useAddNextToPlaylist } from "client/db/useMakePlaylist"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"

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

	return (
		<BasePastSearchItem
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
		>
			<p className={styles.info}>
				{info.join(" · ")}
			</p>
		</BasePastSearchItem>
	)
}
