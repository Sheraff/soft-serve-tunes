import Search from "./Search"
import styles from "./index.module.css"
import { useState } from "react"

export default function Header() {
	const [pane, setPane] = useState(0)
	return (
		<>
			<div className={styles.head}>
				<button
					className={styles.toggle}
					data-open={pane === 1}
					onClick={() => setPane(pane => pane === 1 ? 0 : 1)}
				>
					🔎
				</button>
			</div>
			<Search
				open={pane === 1}
				onClose={() => setPane(0)}
			/>
		</>
	)
}