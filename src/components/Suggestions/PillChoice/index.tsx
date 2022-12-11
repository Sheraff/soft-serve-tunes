import classNames from "classnames"
import styles from "./index.module.css"

export default function PillChoice<
	Option extends {label: string}
>({
	options,
	onSelect,
	current,
}: {
	options: [Option, Option, ...Option[]][]
	onSelect: (option: Option) => void
	current?: Option["label"][]
}) {
	const isCurrent = (option: Option) => current && current.includes(option.label)
	return (
		<div className={styles.main}>
			{options.map((pair) => (
				<div key={pair[0].label + pair[1].label} className={styles.pair}>
					{pair.map((option) => (
						<button
							key={option.label}
							type="button"
							onClick={() => onSelect(option)}
							className={classNames(styles.item, {[styles.current]: isCurrent(option)})}
						>
							<span>{option.label}</span>
						</button>
					))}
				</div>
			))}
		</div>
	)
}