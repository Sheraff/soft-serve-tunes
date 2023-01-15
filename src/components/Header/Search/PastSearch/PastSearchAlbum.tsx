import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import { useQueryClient } from "@tanstack/react-query"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import pluralize from "utils/pluralize"

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
