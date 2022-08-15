import Search from "./Search"
import styles from "./index.module.css"
import { useRouteParts } from "../RouteContext"
import { useRouter } from "next/router"

export default function Header() {
	const {pane, setPane} = useRouteParts()
	// const router = useRouter()
	const onToggle = (pane: "" | "search") => {
		setPane(pane)
		// router.push(`#hello`)
	}
	return (
		<>
			<div className={styles.head}>
				<button
					className={styles.toggle}
					data-open={pane === "search"}
					onClick={() => onToggle(pane === "search" ? "" : "search")}
				>
					🔎
				</button>
			</div>
			<Search />
		</>
	)
}