import { useEffect, useRef, useState } from "react"
import EditIcon from "icons/edit.svg"
import styles from "./index.module.css"

export default function EditableTitle({
	name,
	onEditEnd,
	onEditStart,
}: {
	name?: string
	onEditEnd: {current: (newName: string) => void}
	onEditStart?: {current: () => void}
}) {
	const [editing, setEditing] = useState(false)

	const ref = useRef<HTMLHeadingElement>(null)
	const onStart = () => {
		setEditing(true)
		onEditStart?.current()
	}

	useEffect(() => {
		if (!editing || !ref.current) return
		const element = ref.current
		
		const startName = name || ""
		element.focus()
		element.innerText = startName
		
		// set caret at the end
		const selection = window.getSelection()
		if (selection) {
			const range = document.createRange()
			range.setStart(element.childNodes[0]!, startName.length)
			range.collapse(true)
			selection.removeAllRanges()
			selection.addRange(range)
		}

		const onEnd = () => {
			setEditing(false)
			onEditEnd.current(element.innerText)
		}

		const controller = new AbortController()
		element.addEventListener("blur", () => {
			onEnd()
		}, {passive: true, signal: controller.signal, once: true})
		element.addEventListener("keydown", (event) => {
			if (event.key === "Escape" || event.key === "Enter") {
				event.preventDefault()
				event.stopPropagation()
				onEnd()
			}
		}, {passive: false, signal: controller.signal})
		return () => controller.abort()
	}, [editing, onEditEnd, name])

	return (
		<button className={styles.editable} type="button" onClick={editing ? undefined : onStart}>
			{!editing && (
				<h2 key="original" className={styles.main}>
					{name}
				</h2>
			)}
			{editing && (
				<h2 key="editable" className={styles.main} contentEditable ref={ref} />
			)}
			<EditIcon />
		</button>
	)
}