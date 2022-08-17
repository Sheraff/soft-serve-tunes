import Search from "./Search"
import styles from "./index.module.css"
import { useAppState } from "../AppContext"
import useDisplayAndShow from "../useDisplayAndShow"
import { useRef } from "react"

export default function Header() {
	const {view, setAppState} = useAppState()

	const toggle = useRef<HTMLButtonElement>(null)
	const {display, show} = useDisplayAndShow(view.type === "search", toggle)

	return (
		<>
			<div className={styles.head}>
				<button
					ref={toggle}
					className={styles.toggle}
					data-open={show}
					onClick={() => setAppState(
						({view}) => view.type === "search"
							? {view: {type: "home"}}
							: {view: {type: "search"}}
					)}
				>
					🔎
				</button>
			</div>
			{display && (
				<Search open={show} />
			)}
		</>
	)
}