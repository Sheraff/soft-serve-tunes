import { getPlaylist, useAddToPlaylist, useCreatePlaylist, usePlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import NewIcon from "icons/library_add.svg"
import SmartIcon from "icons/auto_mode.svg"
import styles from "./index.module.css"
import { showHome } from "components/AppContext"
import { autoplay, playAudio } from "components/Player/Audio"
import useIsOnline from "utils/typedWs/useIsOnline"
import OfflineIcon from "icons/wifi_off.svg"

export default function AddToPlaylist ({
	items,
	onSelect,
}: {
	items: { id: string }[]
	onSelect: () => void
}) {
	const { data = [] } = trpc.playlist.searchable.useQuery()

	const { data: current } = usePlaylist()

	const addToPlaylist = useAddToPlaylist()
	const createPlaylist = useCreatePlaylist()
	const { mutateAsync: getMore } = trpc.playlist.more.useMutation()
	const trpcClient = trpc.useContext()
	const online = useIsOnline()

	const onClickNew = () => {
		navigator.vibrate(1)
		if (!items.length) return
		onSelect()
		startTransition(() => {
			const currentPlaylist = getPlaylist()
			createPlaylist(items.map((item) => item.id))
				.then((playlist) => {
					if (currentPlaylist?.current && playlist?.current === currentPlaylist.current)
						playAudio()
				})
			showHome("home")
			autoplay.setState(true)
		})
	}

	const onClickSmart = async () => {
		navigator.vibrate(1)
		if (!items.length) return
		onSelect()

		const trackIds = items.map((item) => item.id)
		const data = (await getMore({
			type: "by-similar-tracks",
			trackIds,
		})) || []

		let name: string
		naming: if (trackIds.length === 1) {
			const id = trackIds[0]!
			const local = trpcClient.track.miniature.getData({ id })?.name
			if (local) {
				name = `Similar to ${local}`
				break naming
			}
			const remote = await trpcClient.track.miniature.fetch({ id })
			if (remote) {
				name = `Similar to ${remote.name}`
			}
		}
		startTransition(() => {
			createPlaylist([...trackIds, ...data.map((item) => item.id)], name)
			showHome("home")
		})
	}

	const onClickLocal = () => {
		navigator.vibrate(1)
		if (!items.length) return
		onSelect()
		startTransition(() => {
			addToPlaylist(null, items)
		})
	}

	const onClickRemote = (id: string) => {
		navigator.vibrate(1)
		if (!items.length) return
		onSelect()
		startTransition(() => {
			addToPlaylist(id, items)
		})
	}

	return (
		<ul>
			{current && !current.id && (
				<li key="local">
					<button
						className={styles.button}
						type="button"
						onClick={onClickLocal}
					>
						{current.name}
					</button>
				</li>
			)}
			{data.map((playlist) => (
				<li key={playlist.id}>
					<button
						className={styles.button}
						type="button"
						onClick={online ? () => onClickRemote(playlist.id) : undefined}
					>
						{!online && <OfflineIcon />}
						{playlist.name}
					</button>
				</li>
			))}
			<li key="new">
				<button
					className={styles.button}
					type="button"
					onClick={onClickNew}
				>
					<NewIcon />
					Create new playlist
				</button>
			</li>
			<li key="smart">
				<button
					className={styles.button}
					type="button"
					onClick={online ? onClickSmart : undefined}
				>
					{!online && <OfflineIcon />}
					{online && <SmartIcon />}
					Create smart playlist
				</button>
			</li>
		</ul>
	)
}