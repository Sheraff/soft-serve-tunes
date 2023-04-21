import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"

export function PastSearchPlaylist ({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
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

	return (
		<BasePastSearchItem
			className={styles.list}
			coverId={entity?.albums?.find(a => a.coverId)?.coverId}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="playlist"
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
