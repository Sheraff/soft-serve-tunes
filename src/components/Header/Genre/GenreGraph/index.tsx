import { GenreItem } from "components/GenreList"
import styles from "./index.module.css"
import { type CSSProperties, useRef, useState, useLayoutEffect, startTransition } from "react"
import classNames from "classnames"

export default function GenreGraph ({
	id,
	setId,
	name,
	genre,
}: {
	id: string
	setId: (id: string) => void
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
		paths: {
			from: string,
			to: string,
			d: string,
		}[]
	}>({
		viewBox: "",
		paths: [],
	})
	const memoPosition = useRef<null | Record<string, { x: number, y: number }>>()
	const onClickGenre = ({ id }: { id: string }) => {
		const current = main.current!.querySelector(`[data-id="${genre!.id}"]`)!.getBoundingClientRect()
		const next = main.current!.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect()
		memoPosition.current = {
			[genre!.id]: {
				x: current.left,
				y: current.top,
			},
			[id]: {
				x: next.left,
				y: next.top,
			},
		}
		startTransition(() => {
			setId(id)
		})
	}

	useLayoutEffect(() => {
		const parent = main.current
		if (!parent) return
		let prevSupCount = 0
		let prevSubCount = 0
		let prevSupPositions: { x: number, y: number }[] = []
		let prevMainPosition: { x: number, top: number, bottom: number } | null = null
		let prevSubPositions: { x: number, y: number }[] = []

		const computePaths = (viewBox: string) => {
			if (!prevMainPosition) {
				startTransition(() => {
					setGraphPaths({ viewBox, paths: [] })
				})
				return
			}
			const paths: {
				from: string,
				to: string,
				d: string,
			}[] = []
			const main = prevMainPosition
			for (let i = 0; i < prevSupCount; i++) {
				const sup = prevSupPositions[i]!
				const mid = (main.top - sup.y) / 2
				const d = `M ${sup.x},${sup.y - 4} C ${sup.x},${sup.y + mid} ${main.x},${main.top - mid} ${main.x},${main.top + 4}`
				const from = genre!.supGenres[i]!.id
				const to = genre!.id
				paths.push({ from, to, d })
				if (memoPosition.current && (from in memoPosition.current) && (to in memoPosition.current)) {
					const path = parent.querySelector(`[data-from="${from}"][data-to="${to}"], [data-from="${to}"][data-to="${from}"]`) as HTMLElement | null
					if (path) {
						path.style.setProperty('d', `path('${d}')`)
					}
				}
			}
			for (let i = 0; i < prevSubCount; i++) {
				const sub = prevSubPositions[i]!
				const mid = (sub.y - main.bottom) / 2
				const d = `M ${main.x},${main.bottom - 4} C ${main.x},${main.bottom + mid} ${sub.x},${sub.y - mid} ${sub.x},${sub.y + 4}`
				const from = genre!.id
				const to = genre!.subGenres[i]!.id
				paths.push({ from, to, d })
				if (memoPosition.current && (from in memoPosition.current) && (to in memoPosition.current)) {
					const path = parent.querySelector(`[data-from="${from}"][data-to="${to}"], [data-from="${to}"][data-to="${from}"]`) as HTMLElement | null
					if (path) {
						path.style.setProperty('d', `path('${d}')`)
					}
				}
			}
			startTransition(() => {
				setGraphPaths({ viewBox, paths })
			})
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

		if (memoPosition.current) for (const [id, pos] of Object.entries(memoPosition.current)) {
			const element = parent.querySelector(`[data-id="${id}"]`)! as HTMLElement
			const rect = element.getBoundingClientRect()
			element.style.setProperty('--x', `${pos.x - rect.left}px`)
			element.style.setProperty('--y', `${pos.y - rect.top}px`)
		}

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
				{graphPaths.paths.map((path) => (
					<path
						key={path.from + path.to}
						data-from={path.from}
						data-to={path.to}
						style={{ 'd': `path('${path.d}')` } as CSSProperties}
					/>
				))}
			</svg>
			{!noTop && (
				<div className={styles.top}>
					{genre.supGenres.map(genre => (
						<div
							key={genre.id}
							data-graph="sup"
							data-id={genre.id}
							className={classNames(styles.item, {
								[styles.noFade]: !memoPosition.current || (genre.id in memoPosition.current)
							})}
						>
							<div>
								<GenreItem
									genre={genre}
									isSelection={false}
									onClick={onClickGenre}
								/>
							</div>
						</div>
					))}
				</div>
			)}
			<div className={styles.middle}>
				<div
					key={genre.id}
					data-graph="main"
					data-id={genre.id}
					className={classNames(styles.item, {
						[styles.noFade]: !memoPosition.current || (genre.id in memoPosition.current)
					})}
				>
					<div>
						<GenreItem
							genre={genre || { id, name }}
							isSelection={false}
							onClick={() => { }}
						/>
					</div>
				</div>
			</div>
			{!noBottom && (
				<div className={styles.bottom}>
					{genre.subGenres.map(genre => (
						<div
							key={genre.id}
							data-graph="sub"
							data-id={genre.id}
							className={classNames(styles.item, {
								[styles.noFade]: !memoPosition.current || (genre.id in memoPosition.current)
							})}
						>
							<div>
								<GenreItem
									genre={genre}
									isSelection={false}
									onClick={onClickGenre}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}