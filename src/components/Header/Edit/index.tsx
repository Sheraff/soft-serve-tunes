import { editOverlay } from "components/AppContext"
import { type ForwardedRef, forwardRef, useDeferredValue, type CSSProperties } from "react"
import styles from "./index.module.css"

export default forwardRef(function EditOverlay({
	z,
	open: _open,
}: {
	z: number
	open: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)
	const {selection} = editOverlay.useValue()
	return (
		<div
			ref={ref}
			className={styles.main}
			data-open={open}
			style={{
				"--z": z,
			} as CSSProperties}
		>
			edit overlay
			{/* menu */}
				{/* edit */}
				{/* delete */}
				{/* if tracks, add multiple to playlist */}
				{/* close */}
		</div>
	)
})