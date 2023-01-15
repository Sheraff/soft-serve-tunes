import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import { useQueryClient } from "@tanstack/react-query"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import pluralize from "utils/pluralize"

export function PastSearchArtist({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
}: PastSearchProps) {
	const { data: entity } = trpc.artist.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const queryClient = useQueryClient()
	const onClick = () => {
		_onClick?.()
		openPanel("artist", { id, name: entity?.name }, queryClient)
	}

	const info = []
	if (showType) {
		info.push("Artist")
	}
	if (entity?._count?.albums && entity._count.albums > 1) {
		info.push(`${entity._count.albums} albums`)
	}
	if (entity?._count?.tracks) {
		info.push(`${entity._count.tracks} track${pluralize(entity._count.tracks)}`)
	}

	return (
		<BasePastSearchItem
			className={styles.artist}
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="artist"
		>
			<p className={styles.info}>
				{info.join(" · ")}
			</p>
		</BasePastSearchItem>
	)
}
