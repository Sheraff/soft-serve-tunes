import { type ForwardedRef, forwardRef, type CSSProperties, useRef, useEffect, useState, useImperativeHandle, useCallback, memo } from "react"
import styles from "./index.module.css"
import { useVirtualizer } from "@tanstack/react-virtual"
import { trpc } from "utils/trpc"
import { PastSearchGenre } from "components/Header/Search/PastSearch/PastSearchGenre"
import { PastSearchAlbum } from "components/Header/Search/PastSearch/PastSearchAlbum"
import { PastSearchArtist } from "components/Header/Search/PastSearch/PastSearchArtist"
import { PastSearchPlaylist } from "components/Header/Search/PastSearch/PastSearchPlaylist"

const AlphabetScrollWithRef = forwardRef(function AlphabetScroll({
	data,
	scrollTo,
}: {
	data: {name: string}[]
	scrollTo: (index: number) => void
}, ref: ForwardedRef<HTMLDivElement>) {
	const main = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => main.current!)
	const total = data.length

	const list = data.reduce<{
		letter: string
		count: number
	}[]>((acc, {name}) => {
		const letter = name[0]!.toUpperCase()
		if (letter === acc.at(-1)?.letter) {
			acc.at(-1)!.count++
		} else {
			acc.push({ letter, count: 1 })
		}
		return acc
	}, [])

	useEffect(() => {
		const el = main.current
		if (!el) return
		const controller = new AbortController()

		const onTouch = (e: TouchEvent) => {
			const {clientY} = e.touches[0]!
			const {top, height} = el.getBoundingClientRect()
			const ratio = (clientY - top) / height * total
			scrollTo(ratio)
		}

		el.addEventListener("touchstart", onTouch, {passive: true, signal: controller.signal})
		el.addEventListener("touchmove", onTouch, {passive: true, signal: controller.signal})

		return () => controller.abort()
	}, [total, scrollTo])

	return (
		<div className={styles.alphabet} ref={main}>
			{list.map(({letter, count}) => (
				<div
					key={letter}
					style={{"--letter-ratio": `${count / total}`} as CSSProperties}
				>
					{letter}
				</div>
			))}
		</div>
	)
})

function BaseList({
	data: _data,
	component: Component,
}: {
	data: {
		id: string
		name: string
	}[]
	component: (props: {id: string, showType: false}) => JSX.Element
}) {
	const data = [..._data].sort((a, b) => a.name < b.name ? -1 : 1)
	const scrollable = useRef<HTMLDivElement>(null)
	const count = data.length

	const rowVirtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollable.current,
		estimateSize: () => 56 + 8,
		getItemKey: (index) => data[index]!.id,
		overscan: 10,
		paddingStart: 8,
	})

	const alphabet = useRef<HTMLDivElement>(null)
	useEffect(() => {
		const element = scrollable.current
		if (!element) return
		const controller = new AbortController()
		let rafId: number | null = null

		element.addEventListener("scroll", () => {
			if (rafId) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				const scrollRatio = element.scrollTop / (element.scrollHeight - element.clientHeight)
				alphabet.current!.style.setProperty("--scroll-offset", `${scrollRatio * alphabet.current!.offsetHeight}px`)
			})
		}, {passive: true, signal: controller.signal})

		return () => {
			controller.abort()
			if (rafId) cancelAnimationFrame(rafId)
		}
	}, [])

	const scrollTo = useCallback((index: number) => {
		scrollable.current!.scrollTo({
			top: index / count * (scrollable.current!.scrollHeight - scrollable.current!.clientHeight),
		})
	}, [count])

	return (
		<>
			<div className={styles.scrollable} ref={scrollable}>
				<div
					className={styles.overflow}
					style={{"--virtual-height": `${rowVirtualizer.getTotalSize()}px`} as CSSProperties}
				>
					{rowVirtualizer.getVirtualItems().map((virtualItem) => (
						<div
							className={styles.row}
							key={virtualItem.key}
							style={{
								"--virtual-item-height": `${virtualItem.size}px`,
								"--virtual-item-start": `${virtualItem.start}px`,
							} as CSSProperties}
						>
							<Component id={data[virtualItem.index]!.id} showType={false} />
						</div>
					))}
				</div>
			</div>
			<AlphabetScrollWithRef
				ref={alphabet}
				data={data}
				// scrollToIndex={rowVirtualizer.scrollToIndex}
				scrollTo={scrollTo}
			/>
		</>
	)
}

function GenreList() {
	const {data = []} = trpc.genre.list.useQuery()
	return (
		<BaseList
			data={data}
			component={PastSearchGenre}
		/>
	)
}

function AlbumList() {
	const {data = []} = trpc.album.searchable.useQuery()
	return (
		<BaseList
			data={data}
			component={PastSearchAlbum}
		/>
	)
}

function ArtistList() {
	const {data = []} = trpc.artist.searchable.useQuery()
	return (
		<BaseList
			data={data}
			component={PastSearchArtist}
		/>
	)
}

function PlaylistList() {
	const {data = []} = trpc.playlist.searchable.useQuery()
	return (
		<BaseList
			data={data}
			component={PastSearchPlaylist}
		/>
	)
}

const LIST_COMPONENTS = {
	Artists: memo(ArtistList),
	Albums: memo(AlbumList),
	Playlists: memo(PlaylistList),
	Genres: memo(GenreList),
} as const

export default forwardRef(function Library({
	z,
	open,
}: {
	z: number
	open: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const [tab, setTab] = useState<keyof typeof LIST_COMPONENTS>("Artists")
	const List = LIST_COMPONENTS[tab]
	return (
		<div
			className={styles.main}
			data-open={open}
			ref={ref}
			style={{
				"--z": z,
			} as CSSProperties}
		>
			<div className={styles.tabs}>
				{Object.keys(LIST_COMPONENTS).map((key) => (
					<button
						key={key}
						data-active={key === tab}
						onClick={() => setTab(key as keyof typeof LIST_COMPONENTS)}
					>
						{key}
					</button>
				))}
			</div>
			<List />
		</div>
	)
})