import { type ForwardedRef, forwardRef, type CSSProperties, useRef, useEffect, useState, useImperativeHandle, useCallback, memo, useMemo } from "react"
import styles from "./index.module.css"
import { useVirtualizer } from "@tanstack/react-virtual"
import { trpc } from "utils/trpc"
import { PastSearchGenre } from "components/Header/Search/PastSearch/PastSearchGenre"
import { PastSearchAlbum } from "components/Header/Search/PastSearch/PastSearchAlbum"
import { PastSearchArtist } from "components/Header/Search/PastSearch/PastSearchArtist"
import { PastSearchPlaylist } from "components/Header/Search/PastSearch/PastSearchPlaylist"
import { PastSearchTrack } from "components/Header/Search/PastSearch/PastSearchTrack"
import suspensePersistedState from "client/db/suspensePersistedState"
import getTouchFromId from "utils/getTouchFromId"

function indexableString(str: string) {
	if (!str) return ""
	return str
		.toUpperCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
}

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
		const _letter = indexableString(name[0]!)
		const letter = _letter >= "A" && _letter <= "Z" ? _letter : "#"
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

		let touch: Touch | null = null
		el.addEventListener("touchstart", (e) => {
			touch = e.touches[0]!
		}, {passive: true, signal: controller.signal})

		
		const scrollToY = (y: number) => {
				const {top, height} = el.getBoundingClientRect()
				const ratio = (y - top) / height * total
				scrollTo(ratio)
		}

		let rafId: number | null = null
		el.addEventListener("touchmove", (e) => {
			if (rafId) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(() => {
				rafId = null
				if (!touch) return
				const current = getTouchFromId(e.touches, touch.identifier)
				if (!current) return

				const deltaX = current.clientX - touch.clientX
				const deltaY = current.clientY - touch.clientY
				if (Math.abs(deltaX) > Math.abs(deltaY)) return

				const {clientY} = current
				scrollToY(clientY)
				touch = current
			})
		}, {passive: true, signal: controller.signal})

		el.addEventListener("click", (e) => {
			const {clientY} = e
			scrollToY(clientY)
		}, {passive: true, signal: controller.signal})

		return () => {
			controller.abort()
			if (rafId) cancelAnimationFrame(rafId)
		}
	}, [total, scrollTo])

	return (
		<div className={styles.alphabet} ref={main}>
			{list.map(({letter, count}, i) => (
				<div
					key={i}
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
	const data = useMemo(
		() => [..._data].sort((a, b) => indexableString(a.name) < indexableString(b.name) ? -1 : 1),
		[_data]
	)
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
				const scrollRatio = element.scrollTop / element.scrollHeight
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
			top: index / count * scrollable.current!.scrollHeight,
		})
	}, [count])

	useEffect(() => {
		const el = scrollable.current
		const al = alphabet.current
		if (!el || !al) return
		const ratio = el.clientHeight / el.scrollHeight
		al.style.setProperty("--scroll-window", `${ratio * 100}%`)
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

function TrackList() {
	const {data = []} = trpc.track.searchable.useQuery()
	return (
		<BaseList
			data={data}
			component={PastSearchTrack}
		/>
	)
}

const LIST_COMPONENTS = {
	Artists: memo(ArtistList),
	Albums: memo(AlbumList),
	Playlists: memo(PlaylistList),
	Genres: memo(GenreList),
	Tracks: memo(TrackList),
} as const

export const libraryTab = suspensePersistedState<keyof typeof LIST_COMPONENTS>("libraryTab", "Artists")

export default forwardRef(function Library({
	z,
	open,
}: {
	z: number
	open: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const [tab, setTab] = libraryTab.useState()
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