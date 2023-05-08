import { GenreItem } from "components/GenreList"
import styles from "./index.module.css"
import { useEffect, useRef, useState } from "react"
import classNames from "classnames"

export default function GenreGraph ({
	id,
	name,
	genre,
}: {
	id: string
	name?: string
	genre?: {
		id: string
		name: string
		subGenres: {
			id: string
			name: string
		}[]
		supGenres: {
			id: string
			name: string
		}[]
		relatedGenres: {
			id: string
			name: string
		}[]
	} | null
}) {
	const isHorizontal = !genre?.relatedGenres?.length

	const main = useRef<HTMLDivElement>(null)
	const [graphPaths, setGraphPaths] = useState<{
		viewBox: string
		paths: string[]
	}>({
		viewBox: "",
		paths: [],
	})
	useEffect(() => {
		const parent = main.current
		if (!parent) return
		let prevSupCount = 0
		let prevSubCount = 0
		let prevSupPositions: { x: number, y: number }[] = []
		let prevMainPosition: { x: number, top: number, bottom: number } | null = null
		let prevSubPositions: { x: number, y: number }[] = []

		const computePaths = (viewBox: string) => {
			const paths: string[] = []
			if (!prevMainPosition) {
				setGraphPaths({ viewBox, paths })
				return
			}
			const main = prevMainPosition
			for (let i = 0; i < prevSupCount; i++) {
				const sup = prevSupPositions[i]!
				paths.push(`
					M ${sup.x},${sup.y}
					C ${sup.x},${sup.y + 16} ${main.x},${main.top - 16} ${main.x},${main.top}
				`)
			}
			for (let i = 0; i < prevSubCount; i++) {
				const sub = prevSubPositions[i]!
				paths.push(`
					M ${sub.x},${sub.y}
					C ${sub.x},${sub.y - 16} ${main.x},${main.bottom + 16} ${main.x},${main.bottom}
				`)
			}
			setGraphPaths({ viewBox, paths })
		}

		const onChange = () => {
			let changed = false
			const reference = parent.getBoundingClientRect()
			const supElements = parent.querySelectorAll("[data-graph=sup]")
			const mainElement = parent.querySelector("[data-graph=main]")
			const subElements = parent.querySelectorAll("[data-graph=sub]")

			if (prevSupCount !== supElements.length) changed = true
			if (prevSubCount !== subElements.length) changed = true
			prevSubCount = subElements.length
			prevSupCount = supElements.length

			const supPositions = Array.from(supElements).map((element, i) => {
				const rect = element.getBoundingClientRect()
				const pos = {
					x: rect.left + rect.width / 2 - reference.left,
					y: rect.bottom - reference.top,
				}
				if (prevSupPositions[i]?.x !== pos.x) changed = true
				if (prevSupPositions[i]?.y !== pos.y) changed = true
				return pos
			})
			prevSupPositions = supPositions

			const mainRect = mainElement?.getBoundingClientRect() ?? null
			const mainPosition = mainRect && {
				x: mainRect.left + mainRect.width / 2 - reference.left,
				top: mainRect.top - reference.top,
				bottom: mainRect.bottom - reference.top,
			}
			if (prevMainPosition?.x !== mainPosition?.x) changed = true
			if (prevMainPosition?.top !== mainPosition?.top) changed = true
			if (prevMainPosition?.bottom !== mainPosition?.bottom) changed = true
			prevMainPosition = mainPosition

			const subPositions = Array.from(subElements).map((element, i) => {
				const rect = element.getBoundingClientRect()
				const pos = {
					x: rect.left + rect.width / 2 - reference.left,
					y: rect.top - reference.top,
				}
				if (prevSubPositions[i]?.x !== pos.x) changed = true
				if (prevSubPositions[i]?.y !== pos.y) changed = true
				return pos
			})
			prevSubPositions = subPositions

			if (!changed) return
			computePaths(`0 0 ${reference.width} ${reference.height}`)
		}

		const mutationObserver = new MutationObserver(onChange)
		mutationObserver.observe(parent, {
			childList: true,
			subtree: true,
		})
		onChange()
		return () => {
			mutationObserver.disconnect()
		}
	}, [genre])

	if (!genre) return null
	const noTop = !genre.supGenres.length
	const noBottom = !genre.subGenres.length
	return (
		<div
			ref={main}
			className={classNames(styles.main, {
				[styles.noTop]: noTop,
				[styles.noBottom]: noBottom,
			})}
		>
			<svg
				className={styles.svg}
				viewBox={graphPaths.viewBox || undefined}
			>
				{graphPaths.paths.map((path, i) => (
					<path
						key={i}
						d={path}
					/>
				))}
			</svg>
			{!noTop && (
				<div className={styles.top}>
					{genre.supGenres.map(genre => (
						<div
							key={genre.id}
							data-graph="sup"
							className={styles.item}
						>
							<GenreItem
								genre={genre}
								isSelection={false}
							/>
						</div>
					))}
				</div>
			)}
			<div className={styles.middle}>
				<div
					data-graph="main"
					className={styles.item}
				>
					<GenreItem
						genre={genre || { id, name }}
						isSelection={false}
						onClick={() => { }}
					/>
				</div>
			</div>
			{!noBottom && (
				<div className={styles.bottom}>
					{genre.subGenres.map(genre => (
						<div
							key={genre.id}
							data-graph="sub"
							className={styles.item}
						>
							<GenreItem
								genre={genre}
								isSelection={false}
							/>
						</div>
					))}
				</div>
			)}
		</div>
	)
}