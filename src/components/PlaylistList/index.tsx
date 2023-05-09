import { openPanel } from "components/AppContext"
import CoverImages from "components/NowPlaying/Cover/Images"
import { startTransition } from "react"
import { type RouterOutputs, trpc } from "utils/trpc"
import styles from "./index.module.css"
import useIsOnline from "utils/typedWs/useIsOnline"
import { useCachedPlaylist } from "client/sw/useSWCached"
import OfflineIcon from "icons/wifi_off.svg"
import classNames from "classnames"

function PlaylistItem ({
	playlist,
	onSelect,
	forceAvailable,
}: {
	playlist: { id: string, name: string }
	onSelect?: (playlist: Exclude<RouterOutputs["playlist"]["get"], null>) => void
	forceAvailable?: boolean
}) {
	const { data } = trpc.playlist.get.useQuery({ id: playlist.id })

	const online = useIsOnline()
	const { data: cached } = useCachedPlaylist({ id: playlist.id, enabled: !online && !forceAvailable })
	const available = forceAvailable || online || cached

	return (
		<button
			className={styles.item}
			type="button"
			onClick={(event) => {
				navigator.vibrate(1)
				startTransition(() => {
					if (!data) return
					onSelect?.(data)
					const element = event.currentTarget
					const { top, height } = element.getBoundingClientRect()
					startTransition(() => {
						openPanel("playlist", {
							id: playlist.id,
							name: data?.name || playlist.name,
							rect: { top, height }
						})
					})
				})
			}}
		>
			<CoverImages
				className={styles.img}
				albums={data ? data.albums.slice(0, 6) : []}
			/>
			<p className={classNames(styles.text, { [styles.offline]: !available })} key="text">
				{!available && <OfflineIcon className={styles.icon} />}
				<span className={styles.title}>{playlist.name}</span>
				<span className={styles.desc}>{data?.description}</span>
			</p>
		</button>
	)
}

export default function PlaylistList ({
	playlists,
	onSelect,
	forceAvailable = false,
	loading,
}: {
	playlists: { id: string, name: string }[]
	onSelect?: Parameters<typeof PlaylistItem>[0]["onSelect"]
	forceAvailable?: boolean
	loading?: boolean
}) {
	return (
		<ul className={classNames(styles.list, { [styles.loading]: loading })}>
			{playlists.map((playlist) => (
				<li key={playlist.id}>
					<PlaylistItem
						playlist={playlist}
						onSelect={onSelect}
						forceAvailable={forceAvailable}
					/>
				</li>
			))}
		</ul>
	)
}