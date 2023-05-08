import { type ForwardedRef, forwardRef, startTransition, useMemo, useDeferredValue, useRef, useImperativeHandle } from "react"
import Panel from "../Panel"
import { openPanel, showHome } from "components/AppContext"
import { trpc } from "utils/trpc"
import { getPlaylist, setPlaylist } from "client/db/useMakePlaylist"
import { autoplay, playAudio } from "components/Player/Audio"
import SectionTitle from "atoms/SectionTitle"
import TrackList, { useVirtualTracks } from "components/TrackList"
import styles from "./index.module.css"
import GenreGraph from "components/Header/Genre/GenreGraph"
import AlbumList from "components/AlbumList"
import ArtistList from "components/ArtistList"
import { shuffle } from "components/Player"

export default forwardRef(function GenreView ({
	open,
	id,
	z,
	rect,
	name,
	isTop,
}: {
	open: boolean
	id: string
	z: number
	rect?: {
		top: number
		left?: number
		width?: number
		height?: number
		src?: string
	}
	name?: string
	isTop: boolean
}, ref: ForwardedRef<HTMLDivElement>) {
	const enabled = Boolean(id && open)
	const { data, isLoading } = trpc.genre.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	const onClickPlay = () => {
		if (!data) return
		startTransition(() => {
			if (!shuffle.getValue()) {
				shuffle.setState(true)
			}
			const playlist = getPlaylist()
			setPlaylist(data.name, data.tracks)
			if (playlist?.current && playlist.current === data.tracks[0]?.id) {
				playAudio()
			} else {
				autoplay.setState(true)
			}
			showHome("home")
		})
	}

	const { albums, artists } = useDeferredValue(data) || {}
	const loading = useDeferredValue(isLoading)
	const children = (
		<>
			{useMemo(() => artists && Boolean(artists.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Artists</SectionTitle>
					<ArtistList artists={artists} loading={loading} lines={1} />
				</>
			), [artists, loading])}
			{useMemo(() => albums && Boolean(albums.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
					<AlbumList albums={albums} loading={loading} scrollable lines={1} />
				</>
			), [albums, loading])}
		</>
	)

	const coverElement = (
		<GenreGraph
			id={id}
			name={name}
			genre={data}
		/>
	)

	const parent = useRef<HTMLDivElement>(null)

	useImperativeHandle(ref, () => parent.current!)

	return (
		<Panel
			ref={parent}
			open={open}
			z={z}
			rect={rect}
			// description={data?.audiodb?.strDescriptionEN}
			// coverId={data?.cover?.id}
			coverElement={coverElement}
			coverPalette={data?.palette}
			infos={[]}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={""}
			isTop={isTop}
		>
			{children}
		</Panel>
	)
})