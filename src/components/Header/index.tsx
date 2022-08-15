import Search from "./Search"
import styles from "./index.module.css"
import { useRouteParts } from "../RouteContext"
import useDisplayAndShow from "../useDisplayAndShow"
import { useRef } from "react"

export default function Header() {
	const {pane, setPane} = useRouteParts()

	const toggle = useRef<HTMLButtonElement>(null)
	const {display, show} = useDisplayAndShow(pane === "search", toggle)

	return (
		<>
			<div className={styles.head}>
				<button
					ref={toggle}
					className={styles.toggle}
					data-open={show}
					onClick={() => setPane(pane === "search" ? "" : "search")}
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