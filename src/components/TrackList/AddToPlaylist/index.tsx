import Dialog from "atoms/Dialog"
import { useAddToPlaylist } from "client/db/useMakePlaylist"
import { startTransition } from "react"
import { trpc } from "utils/trpc"

export default function AddToPlaylist({
	item,
	setItem,
}: {
	item: {id: string} | null
	setItem: (item: null) => void
}) {
	const {data} = trpc.useQuery(["playlist.list"])
	const hasSomePlaylsts = Boolean(data?.length)
	const addToPlaylist = useAddToPlaylist()
	return (
		<Dialog title="Add to playlist" open={Boolean(item)} onClose={() => setItem(null)}>
			{!hasSomePlaylsts && (
				<p>No playlists were created yet</p>
			)}
			{hasSomePlaylsts && (
				data!.map((playlist) => (
					<button
						key={playlist.id}
						type="button"
						onClick={() => {
							if (!item) return
							setItem(null)
							startTransition(() => {
								addToPlaylist(playlist.id, item)
							})
						}}
					>
						{playlist.name}
					</button>
				))
			)}
		</Dialog>
	)
}