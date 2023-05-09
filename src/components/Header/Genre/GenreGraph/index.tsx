import { GenreItem } from "components/GenreList"
import styles from "./index.module.css"
import { type CSSProperties, useRef, useState, useLayoutEffect, startTransition, useDeferredValue, memo } from "react"
import classNames from "classnames"
import { editOverlay } from "components/AppContext/editOverlay"

export default memo(function GenreGraph ({
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
	const main = useRef<HTMLDivElement>(null)

	// fallback layout when genre is not part of the graph
	const isHorizontal = genre && Boolean(genre?.relatedGenres?.length)

	// long press to edit
	const _editViewState = editOverlay.useValue()
	const editViewState = useDeferredValue(_editViewState)
	const isSelection = editViewState.type === "genre"

	// svg paths for graph
	const [graphPaths, setGraphPaths] = useState<{
		viewBox: string
		paths: {
			from: string,
			to: string,
			d: string,
		}[]
	} | null>(null)

	// ref to avoid animating on "first render" (except that it takes a few renders to get the graph paths)
	const firstRenderRef = useRef<boolean>(false)
	const isInitialRender = !firstRenderRef.current
	firstRenderRef.current = Boolean(genre && graphPaths)

	// remember element positions to animate between them
	const memoPosition = useRef<null | Record<string, { x: number, y: number }>>()
	const onClickGenre = ({ id }: { id: string }) => {
		const current = main.current!.querySelector(`[data-id="${genre!.id}"]`)!.getBoundingClientRect()
		memoPosition.current = {
			[genre!.id]: {
				x: current.left,
				y: current.top,
			},
		}
		if (isHorizontal) {
			for (const side of genre!.relatedGenres) {
				const current = main.current!.querySelector(`[data-id="${side.id}"]`)!.getBoundingClientRect()
				memoPosition.current[side.id] = {
					x: current.left,
					y: current.top,
				}
			}
		} else {
			const next = main.current!.querySelector(`[data-id="${id}"]`)!.getBoundingClientRect()
			memoPosition.current[id] = {
				x: next.left,
				y: next.top,
			}
		}
		startTransition(() => {
			setId(id)
			setGraphPaths(graphPaths => {
				if (!graphPaths) return null
				const current = graphPaths.paths.find(path => (path.to === id && path.from === genre!.id) || (path.from === id && path.to === genre!.id))
				if (!current) return {
					viewBox: graphPaths.viewBox,
					paths: [],
				}
				return {
					viewBox: graphPaths.viewBox,
					paths: [current],
				}
			})
		})
	}

	// animation + svg math
	useLayoutEffect(() => {
		const parent = main.current
		if (!parent) return
		let prevSupCount = 0
		let prevSubCount = 0
		let prevSupPositions: { x: number, y: number }[] = []
		let prevMainPosition: { x: number, top: number, bottom: number, right: number } | null = null
		let prevSubPositions: { x: number, y: number }[] = []
		let prevSidePositions: { x: number, y: number }[] = []

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
			for (let i = 0; i < prevSidePositions.length; i++) {
				const side = prevSidePositions[i]!
				const mid = (side.x - main.right) / 2
				const mainY = (main.top + main.bottom) / 2
				const d = `M ${main.right - 4},${mainY} C ${main.right + mid},${mainY} ${side.x - mid},${side.y} ${side.x + 4},${side.y}`
				paths.push({ from: genre!.id, to: genre!.relatedGenres[i]!.id, d })
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
			const sideElements = parent.querySelectorAll("[data-graph=side]")

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
				right: mainRect.right - reference.left,
			}
			if (prevMainPosition?.x !== mainPosition?.x) changed = true
			if (prevMainPosition?.top !== mainPosition?.top) changed = true
			if (prevMainPosition?.bottom !== mainPosition?.bottom) changed = true
			if (prevMainPosition?.right !== mainPosition?.right) changed = true
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

			const sidePositions = Array.from(sideElements).map((element, i) => {
				const rect = element.getBoundingClientRect()
				const pos = {
					x: rect.left - reference.left,
					y: rect.top + rect.height / 2 - reference.top,
				}
				if (prevSidePositions[i]?.x !== pos.x) changed = true
				if (prevSidePositions[i]?.y !== pos.y) changed = true
				return pos
			})
			prevSidePositions = sidePositions

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
			const element = parent.querySelector(`[data-id="${id}"]`) as HTMLElement | null
			if (!element) continue
			const rect = element.getBoundingClientRect()
			element.style.setProperty('--x', `${pos.x - rect.left}px`)
			element.style.setProperty('--y', `${pos.y - rect.top}px`)
		}

		return () => {
			mutationObserver.disconnect()
		}
	}, [genre])

	const noTop = !genre?.supGenres.length
	const noBottom = !genre?.subGenres.length
	const displayGenre = genre || { id, name }
	return (
		<div
			ref={main}
			className={classNames(styles.main, {
				[styles.noTop]: noTop,
				[styles.noBottom]: noBottom,
				[styles.noAnim]: isInitialRender,
				[styles.horizontal]: isHorizontal,
			})}
		>
			<svg
				className={styles.svg}
				viewBox={graphPaths?.viewBox || undefined}
			>
				{graphPaths?.paths.map((path) => (
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
								[styles.noFade]: !memoPosition.current || (genre.id in memoPosition.current),
							})}
						>
							<div>
								<GenreItem
									genre={genre}
									onClick={onClickGenre}
									isSelection={isSelection}
									selected={isSelection && editViewState.selection.some(({ id }) => id === genre.id)}
								/>
							</div>
						</div>
					))}
				</div>
			)}
			<div className={styles.middle}>
				<div
					key={displayGenre.id}
					data-graph="main"
					data-id={displayGenre.id}
					className={classNames(styles.item, {
						[styles.noFade]: !memoPosition.current || ((displayGenre.id) in memoPosition.current),
					})}
				>
					<div>
						<GenreItem
							genre={displayGenre}
							onClick={() => { }}
							isSelection={isSelection}
							selected={isSelection && editViewState.selection.some(({ id }) => id === (displayGenre.id))}
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
								[styles.noFade]: !memoPosition.current || (genre.id in memoPosition.current),
							})}
						>
							<div>
								<GenreItem
									genre={genre}
									onClick={onClickGenre}
									isSelection={isSelection}
									selected={isSelection && editViewState.selection.some(({ id }) => id === genre.id)}
								/>
							</div>
						</div>
					))}
				</div>
			)}
			{isHorizontal && (
				<div className={styles.side}>
					{genre.relatedGenres.map(g => (
						<div
							key={genre.id + g.id}
							data-graph="side"
							data-id={g.id}
							className={classNames(styles.item, {
								[styles.noFade]: !memoPosition.current || (g.id in memoPosition.current),
							})}
						>
							<div>
								<GenreItem
									genre={g}
									onClick={onClickGenre}
									isSelection={isSelection}
									selected={isSelection && editViewState.selection.some(({ id }) => id === g.id)}
								/>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
})