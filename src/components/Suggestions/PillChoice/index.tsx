import classNames from "classnames"
import styles from "./index.module.css"

export default function PillChoice<
	Option extends {label: string}
>({
	options,
	onSelect,
	current,
}: {
	options: [Option, Option][]
	onSelect: (option: Option) => void
	current?: Option["label"]
}) {
	return (
		<div className={styles.main}>
			{options.map((pair) => (
				<div key={pair[0].label + pair[1].label} className={styles.pair}>
					<button
						key={pair[0].label}
						type="button"
						onClick={() => onSelect(pair[0])}
						className={classNames(styles.item, {[styles.current]: current === pair[0].label})}
					>
						{pair[0].label}
					</button>
					<button
						key={pair[1].label}
						type="button"
						onClick={() => onSelect(pair[1])}
						className={classNames(styles.item, {[styles.current]: current === pair[1].label})}
					>
						{pair[1].label}
					</button>
				</div>
			))}
		</div>
	)
}