import { getPlaylist, useAddToPlaylist, useCreatePlaylist, usePlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import NewIcon from "icons/library_add.svg"
import SmartIcon from "icons/auto_mode.svg"
import styles from "./index.module.css"
import { useShowHome } from "components/AppContext"
import { autoplay, playAudio } from "components/Player/Audio"

export default function AddToPlaylist ({
	items,
	onSelect,
}: {
	items: { id: string }[]
	onSelect: () => void
}) {
	const { data = [] } = trpc.playlist.list.useQuery()

	const { data: current } = usePlaylist()

	const addToPlaylist = useAddToPlaylist()
	const createPlaylist = useCreatePlaylist()
	const { mutateAsync: getMore } = trpc.playlist.more.useMutation()
	const trpcClient = trpc.useContext()
	const showHome = useShowHome()

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

	return (
		<ul>
			{current && !current.id && (
				<li key="local">
					<button
						className={styles.button}
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							if (!items.length) return
							onSelect()
							startTransition(() => {
								addToPlaylist(null, items)
							})
						}}
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
						onClick={() => {
							navigator.vibrate(1)
							if (!items.length) return
							onSelect()
							startTransition(() => {
								addToPlaylist(playlist.id, items)
							})
						}}
					>
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
					<NewIcon className={styles.icon} />
					Create new playlist
				</button>
			</li>
			<li key="smart">
				<button
					className={styles.button}
					type="button"
					onClick={onClickSmart}
				>
					<SmartIcon className={styles.icon} />
					Create smart playlist
				</button>
			</li>
		</ul>
	)
}