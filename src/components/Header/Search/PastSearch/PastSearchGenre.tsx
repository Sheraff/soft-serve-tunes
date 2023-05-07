import { trpc } from "utils/trpc"
import { showHome } from "components/AppContext"
import styles from "./index.module.css"
import pluralize from "utils/pluralize"
import { getPlaylist, setPlaylist } from "client/db/useMakePlaylist"
import { BasePastSearchItem, type PastSearchProps } from "./BasePastSearchItem"
import { autoplay, playAudio } from "components/Player/Audio"
import { startTransition } from "react"
import { useCachedGenre } from "client/sw/useSWCached"
import useIsOnline from "utils/typedWs/useIsOnline"

export function PastSearchGenre ({
	id,
	onSettled,
	onClick: _onClick,
	showType = true,
	forceAvailable = false,
}: PastSearchProps) {
	const online = useIsOnline()
	const { data: cached } = useCachedGenre({ id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	const { data: entity } = trpc.genre.miniature.useQuery({ id }, { onSettled: (data) => onSettled?.(!!data) })
	const trpcClient = trpc.useContext()
	const onClick = () => {
		_onClick?.()
		if (!available) return
		trpcClient.genre.get.fetch({ id }).then((data) => {
			if (!data) return
			startTransition(() => {
				const playlist = getPlaylist()
				setPlaylist(data.name, data.tracks)
				if (playlist?.current && playlist.current === data.tracks[0]?.id) {
					playAudio()
				} else {
					autoplay.setState(true)
				}
				showHome("home")
			})
		})
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
			cover={entity?.artists?.[0]}
			available={available}
		>
			{info.join(" · ")}
		</BasePastSearchItem>
	)
}
