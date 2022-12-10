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
	current?: Option["label"][]
}) {
	const isCurrent = (option: Option) => current && current.includes(option.label)
	return (
		<div className={styles.main}>
			{options.map((pair) => (
				<div key={pair[0].label + pair[1].label} className={styles.pair}>
					<button
						key={pair[0].label}
						type="button"
						onClick={() => onSelect(pair[0])}
						className={classNames(styles.item, {[styles.current]: isCurrent(pair[0])})}
					>
						<span>{pair[0].label}</span>
					</button>
					<button
						key={pair[1].label}
						type="button"
						onClick={() => onSelect(pair[1])}
						className={classNames(styles.item, {[styles.current]: isCurrent(pair[1])})}
					>
						<span>{pair[1].label}</span>
					</button>
				</div>
			))}
		</div>
	)
}