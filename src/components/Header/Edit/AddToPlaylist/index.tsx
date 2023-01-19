import { useAddToPlaylist, useCreatePlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"
import NewIcon from "icons/library_add.svg"
import SmartIcon from "icons/auto_mode.svg"
import styles from "./index.module.css"

export default function AddToPlaylist({
	items,
	onSelect,
}: {
	items: {id: string}[]
	onSelect: () => void
}) {
	const {data} = trpc.playlist.list.useQuery()
	const addToPlaylist = useAddToPlaylist()
	const createPlaylist = useCreatePlaylist()
	const {mutateAsync: getMore} = trpc.playlist.more.useMutation()
	const trpcClient = trpc.useContext()

	const onClickNew = () => {
		navigator.vibrate(1)
		if (!items.length) return
		onSelect()
		startTransition(() => {
			createPlaylist(items.map((item) => item.id))
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
			const local = trpcClient.track.miniature.getData({id})?.name
			if (local) {
				name = `Similar to ${local}`
				break naming
			}
			const remote = await trpcClient.track.miniature.fetch({id})
			if (remote) {
				name = `Similar to ${remote.name}`
			}
		}
		startTransition(() => {
			createPlaylist([...trackIds, ...data.map((item) => item.id)], name)
		})
	}

	return (
		<ul>
			{data!.map((playlist) => (
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
					<NewIcon className={styles.icon}/>
					Create new playlist
				</button>
			</li>
			<li key="smart">
				<button
					className={styles.button}
					type="button"
					onClick={onClickSmart}
				>
					<SmartIcon className={styles.icon}/>
					Create smart playlist
				</button>
			</li>
		</ul>
	)
}