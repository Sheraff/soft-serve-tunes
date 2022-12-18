import { editOverlay } from "components/AppContext"
import { type ForwardedRef, forwardRef, useDeferredValue, type CSSProperties, useState, useRef } from "react"
import pluralize from "utils/pluralize"
import styles from "./index.module.css"
import CloseIcon from "icons/close.svg"
import EditIcon from "icons/edit.svg"
import DeleteIcon from "icons/delete.svg"
import PlaylistAddIcon from "icons/playlist_add.svg"

/**
 * create `editOverlay` state setter function
 * - add item to selection if not present
 * - remove item from selection if already present
 * - if new item is ≠ type, remove all items but new one (no mixed types)
 * 
 * add "long press" to albums and artists too
 * + "add to selection" on regular click if a selection is ongoing
 * 
 * does it need to close on navigation?
 * this could be useful for
 * - adding many different entities to a playlist at once
 * this could be a pain because
 * - it need we have to handle clicks on items and know whether to add them to the selection or to navigate to them
 * 
 * when clicking "delete", show a big worrying warning "this is forever"
 * 
 * when "add to playlist"
 * - show standard modal?
 * - or show list within this overlay? (maybe we could use this overlay for all "add to playlist" actions)
 */

export default forwardRef(function EditOverlay({
	z,
	open: _open,
}: {
	z: number
	open: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)
	const [{selection}, setState] = editOverlay.useState()
	const [editOpen, setEditOpen] = useState(false)

	const stableSelection = useRef<typeof selection>(selection)
	if (selection.length !== 0) {
		stableSelection.current = selection
	}
	const type = stableSelection.current.every(item => item.type === stableSelection.current[0]!.type)
		? stableSelection.current[0]!.type
		: "error"
	const selectionSummary = `${stableSelection.current.length} ${type}${pluralize(stableSelection.current.length)} selected`

	return (
		<div
			ref={ref}
			className={styles.main}
			data-open={open}
			style={{
				"--z": z,
			} as CSSProperties}
		>
			<div className={styles.head}>
				<div className={styles.menu}>
					<button
						type="button"
						onClick={() => setEditOpen(prev => !prev)}
					>
						<DeleteIcon />
					</button>
					<button
						type="button"
						onClick={() => setEditOpen(prev => !prev)}
					>
						<EditIcon />
					</button>
					{type === "track" && (
						<button
							type="button"
							onClick={() => setEditOpen(prev => !prev)}
						>
							<PlaylistAddIcon />
						</button>
					)}
					<button
						type="button"
						onClick={() => setState(prev => ({...prev, selection: []}))}
					>
						<CloseIcon />
					</button>
				</div>
				<p>{selectionSummary}</p>
			</div>
			<div className={styles.body} data-open={editOpen}>
				{/* edit */}
			</div>
		</div>
	)
})