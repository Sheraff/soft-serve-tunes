import { trpc } from "utils/trpc"
import { openPanel } from "components/AppContext"
import styles from "./index.module.css"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import pluralize from "utils/pluralize"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedArtist } from "client/sw/useSWCached"

export function PastSearchArtist ({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
}: PastSearchProps) {
	const { data: entity } = trpc.artist.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const onClick = () => {
		_onClick?.()
		openPanel("artist", { id, name: entity?.name })
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

	const online = useIsOnline()
	const { data: cached } = useCachedArtist({ id, enabled: !online })
	const offline = !online && cached

	return (
		<BasePastSearchItem
			className={styles.artist}
			coverId={entity?.cover?.id}
			onClick={onClick}
			name={entity?.name}
			id={id}
			type="artist"
			offline={offline}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
