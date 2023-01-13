import { type ForwardedRef, forwardRef, useDeferredValue, useState, useRef, useEffect, type ReactNode, useImperativeHandle, CSSProperties, startTransition, Children, Fragment, cloneElement, ReactElement } from "react"
import { useShowHome } from "components/AppContext"
import PlayIcon from "icons/play_arrow.svg"
import { type Prisma } from "@prisma/client"
import { paletteToCSSProperties } from "components/Palette"
import Head from "next/head"
import classNames from "classnames"
import styles from "./index.module.css"
import SectionTitle from "atoms/SectionTitle"

export default forwardRef(function PanelView({
	open: _open,
	z,
	view,
	description,
	coverId,
	coverPalette,
	coverElement,
	infos,
	title,
	onClickPlay,
	children,
	animationName
}: {
	open: boolean
	z: number
	view: {
		open: boolean
		rect?: {
			top: number,
			left?: number,
			width?: number,
			height?: number,
			src?: string,
		}
	}
	description?: string | null
	coverId?: string
	coverPalette?: Prisma.JsonValue
	coverElement?: ReactElement
	infos: ReactNode[]
	title: string | undefined
	onClickPlay: () => void
	children: ReactNode
	animationName: string
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)

	const showHome = useShowHome()

	const [seeBio, setSeeBio] = useState<boolean | null>(false) // null means "no need for toggle, small enough"
	const bio = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const element = bio.current
		if (!element) return
		const observer = new ResizeObserver(([entry]) => {
			if (entry) {
				const parent = entry.target.parentElement as HTMLDivElement
				if (parent.offsetHeight >= Math.floor(entry.contentRect.height)) {
					setSeeBio(null)
				}
			}
		})
		observer.observe(element)
		return () => observer.disconnect()
	}, [description])

	const palette = paletteToCSSProperties(coverPalette)

	const main = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => main.current as HTMLDivElement)

	// synchronously compute initial position if an `artist.rect` emitter has been set
	const initialPositionRef = useRef<CSSProperties | null>(null)
	const initialImageSrc = useRef<string | null>(null)
	if (open && !initialPositionRef.current && view.rect) {
		initialPositionRef.current = {
			"--top": `${view.rect.top}px`,
			"--left": `${view.rect.left ?? 0}px`,
			"--scale": `${(view.rect.width ?? innerWidth) / innerWidth}`,
			...(view.rect.height ? {"--clipY": `${view.rect.height}px`} : {}),
			"--end": `${Math.hypot(innerWidth, innerHeight)}px`,
		} as CSSProperties
		initialImageSrc.current = view.rect.src || null
	}

	return (
		<div
			className={styles.main}
			data-open={open}
			data-bubble={initialPositionRef.current !== null}
			ref={main}
			style={{
				"--z": z,
				"--bubble-open": animationName,
				...palette,
				...(initialPositionRef.current || {}),
			} as CSSProperties}
		>
			{palette && view.open && (
				<Head>
					<meta name="theme-color" content={palette["--palette-bg-main"]} />
				</Head>
			)}
			<img
				className={classNames(styles.img, styles.preview)}
				src={initialImageSrc.current || ""}
				alt=""
			/>
			{!coverElement && (
				<img
					className={styles.img}
					src={coverId ? `/api/cover/${coverId}` : ""}
					alt=""
					decoding="async"
				/>
			)}
			{coverElement && (
					cloneElement(coverElement, {className: styles.img})
			)}
			<div className={styles.head}>
				<SectionTitle className={styles.sectionTitle}>{title}</SectionTitle>
				<p className={styles.info}>
					{infos.map((info, i) => (
						<Fragment key={i}>
							{i > 0 ? " · " : ""}
							{info}
						</Fragment>
					))}
				</p>
				{description && (
					<div
						className={classNames(styles.bio, {[styles.seeBio]: seeBio !== false})}
						onClick={seeBio !== null ? () => {
							navigator.vibrate(1)
							setSeeBio(!seeBio)
						} : undefined}
					>
						<div className={styles.bioText}>
							<div ref={bio}>
								{description}
							</div>
						</div>
						{seeBio !== null && (
							<button
								className={styles.toggle}
								type="button"
							>
								{seeBio ? "...Less" : "More..."}
							</button>
						)}
					</div>
				)}
				<button
					className={styles.play}
					type="button"
					onClick={() => {
						navigator.vibrate(1)
						startTransition(() => {
							onClickPlay()
							showHome("home")
						})
					}}
				>
					<PlayIcon />
				</button>
			</div>
			{Children.map(children, child => (
				<div className={styles.section}>
					{child}
				</div>
			))}
		</div>
	)
})