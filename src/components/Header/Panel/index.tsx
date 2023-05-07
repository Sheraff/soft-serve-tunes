import {
	type ForwardedRef,
	forwardRef,
	useDeferredValue,
	useState,
	useRef,
	useEffect,
	type ReactNode,
	useImperativeHandle,
	type CSSProperties,
	Children,
	Fragment,
	cloneElement,
	type ReactElement,
	type ReactFragment,
} from "react"
import { type Prisma } from "@prisma/client"
import { paletteToCSSProperties } from "components/Palette"
import Head from "next/head"
import classNames from "classnames"
import styles from "./index.module.css"
import SectionTitle from "atoms/SectionTitle"
import PlayButton from "./PlayButton"
import { getCoverUrl } from "utils/getCoverUrl"

export default forwardRef(function PanelView ({
	open: _open,
	z,
	rect,
	description,
	cover,
	coverPalette,
	coverElement,
	infos,
	title,
	onClickPlay,
	children,
	animationName,
	isTop,
	buttons,
}: {
	open: boolean
	z: number
	rect?: {
		top: number,
		left?: number,
		width?: number,
		height?: number,
		src?: string,
	}
	description?: string | null
	cover?: {
		id: string
		blur?: string | null | undefined
	} | null | undefined
	coverPalette?: Prisma.JsonValue
	coverElement?: ReactElement
	infos: ReactNode[]
	title: string | undefined
	onClickPlay: () => void
	children: ReactNode
	animationName: string
	isTop: boolean
	buttons?: ReactElement | ReactFragment
}, ref: ForwardedRef<HTMLDivElement>) {
	const open = useDeferredValue(_open)

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
	if (open && !initialPositionRef.current && rect) {
		initialPositionRef.current = {
			"--top": `${rect.top}px`,
			"--left": `${rect.left ?? 0}px`,
			"--scale": `${(rect.width ?? innerWidth) / innerWidth}`,
			...(rect.height ? { "--clipY": `${rect.height}px` } : {}),
			"--end": `${Math.hypot(innerWidth, innerHeight)}px`,
		} as CSSProperties
		initialImageSrc.current = rect.src || null
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
			{palette && isTop && (
				<Head>
					<meta name="theme-color" content={palette["--palette-bg-main"]} />
				</Head>
			)}
			{initialImageSrc.current && (
				<img
					className={classNames(styles.img, styles.preview)}
					src={initialImageSrc.current}
					alt=""
					style={{
						'--blur': cover?.blur ? `url("${cover.blur}")` : undefined,
					} as CSSProperties}
				/>
			)}
			{!coverElement && cover && (
				<img
					className={styles.img}
					src={getCoverUrl(cover.id, "full")}
					alt=""
					decoding={initialImageSrc.current ? "async" : undefined}
				/>
			)}
			{coverElement && (
				cloneElement(coverElement, { className: styles.img })
			)}
			{!initialImageSrc.current && !cover && !coverElement && (
				<div className={styles.img} />
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
						className={classNames(styles.bio, { [styles.seeBio]: seeBio !== false })}
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
				<PlayButton
					onClick={onClickPlay}
					className={styles.play}
				>
					{buttons}
				</PlayButton>
			</div>
			{Children.map(children, child => (
				<div className={styles.section}>
					{child}
				</div>
			))}
		</div>
	)
})