import { editOverlay, editOverlaySetter } from "components/AppContext/editOverlay"
import { type ForwardedRef, forwardRef, useDeferredValue, type CSSProperties, useState, useRef } from "react"
import pluralize from "utils/pluralize"
import styles from "./index.module.css"
import CloseIcon from "icons/close.svg"
import EditIcon from "icons/edit.svg"
import DeleteIcon from "icons/delete.svg"
import PlaylistAddIcon from "icons/playlist_add.svg"
import AddToPlaylist from "./AddToPlaylist"
import Delete from "./Delete"

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
	const [editState, setState] = editOverlay.useState()

	const stableEditState = useRef<typeof editState>(editState)
	if (editState.selection.length !== 0) {
		stableEditState.current = editState
	}
	const {selection, type} = stableEditState.current
	const selectionSummary = `${selection.length} ${type}${pluralize(selection.length)} selected`

	const [_body, _setBody] = useState<"playlist" | "edit" | "delete" | null>(null)
	const stableBody = useRef<typeof _body>(_body)
	if (_body !== null) {
		stableBody.current = _body
	}
	const body = stableBody.current

	const bodyRef = useRef<HTMLDivElement>(null)
	const setBody = async (next: typeof _body) => {
		navigator.vibrate(1)
		if (next === _body) return _setBody(null)
		if (_body === null) return _setBody(next)

		_setBody(null)
		const animation = bodyRef.current!.animate([
			{clipPath: "inset(0 0 0 0)"},
			{clipPath: "inset(100% 0 0 0)"},
		], {
			fill: "both",
			duration: 350,
			easing: "ease-in"
		})
		await animation.finished
		animation.cancel()
		_setBody(next)
	}

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
			<p className={styles.summary}>{selectionSummary}</p>
				<div className={styles.menu}>
					<button
						type="button"
						onClick={() => setBody("delete")}
					>
						<DeleteIcon className={styles.trash} />
					</button>
					<button
						type="button"
						onClick={() => setBody("edit")}
					>
						<EditIcon className={styles.pen} />
					</button>
					{type === "track" && (
						<button
							type="button"
							onClick={() => setBody("playlist")}
						>
							<PlaylistAddIcon />
						</button>
					)}
					<button
						type="button"
						onClick={() => {
							navigator.vibrate(1)
							setState(editOverlaySetter(null))
						}}
					>
						<CloseIcon />
					</button>
				</div>
				
			</div>
			<div className={styles.body} data-open={Boolean(_body)} ref={bodyRef}>
				{body === "playlist" && (
					<AddToPlaylist
						items={selection}
						onSelect={() => setState(editOverlaySetter(null))}
					/>
				)}
				{body === "edit" && (
					<p>edit</p>
				)}
				{body === "delete" && (
					<Delete
						ids={selection.map(({id}) => id)}
						onDone={() => setState(editOverlaySetter(null))}
					/>
				)}
			</div>
		</div>
	)
})