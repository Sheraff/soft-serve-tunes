import Dialog from "atoms/Dialog"
import AddToPlaylist from "components/Header/Edit/AddToPlaylist"

export default function DialogAddToPlaylist({
	item,
	setItem,
}: {
	item: {id: string} | null
	setItem: (item: null) => void
}) {
	return (
		<Dialog title="Add to playlist" open={Boolean(item)} onClose={() => setItem(null)}>
			<AddToPlaylist
				items={item ? [item] : []}
				onSelect={() => setItem(null)}
			/>
		</Dialog>
	)
}