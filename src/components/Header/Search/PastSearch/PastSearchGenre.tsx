import { trpc } from "utils/trpc"
import { useShowHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"

export function PastSearchGenre ({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
}: PastSearchProps) {
	const { data: entity } = trpc.genre.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const makePlaylist = useMakePlaylist()
	const showHome = useShowHome()
	const onClick = () => {
		_onClick?.()
		makePlaylist({ type: "genre", id }, entity ? entity.name : "New Playlist")
		showHome("home")
	}

	const info = []
	if (showType) {
		info.push("Genre")
	}
	if (entity?._count?.tracks) {
		info.push(`${entity._count.tracks} track${pluralize(entity._count.tracks)}`)
	}

	return (
		<BasePastSearchItem
			className={styles.list}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="genre"
			coverId={entity?.artists?.[0]?.coverId}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
