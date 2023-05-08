import { type ForwardedRef, forwardRef, startTransition, useMemo, useDeferredValue, useRef, useImperativeHandle, useEffect, useState } from "react"
import Panel from "../Panel"
import { showHome } from "components/AppContext"
import { trpc } from "utils/trpc"
import { getPlaylist, setPlaylist } from "client/db/useMakePlaylist"
import { autoplay, playAudio } from "components/Player/Audio"
import SectionTitle from "atoms/SectionTitle"
import TrackList from "components/TrackList"
import styles from "./index.module.css"
import GenreGraph from "components/Header/Genre/GenreGraph"
import AlbumList from "components/AlbumList"
import ArtistList from "components/ArtistList"
import { shuffle } from "components/Player"
import usePlaylistDescription from "components/NowPlaying/Cover/usePlaylistDescription"

export default forwardRef(function GenreView ({
	open,
	id: initialId,
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
	const [id, setId] = useState(initialId)
	const enabled = Boolean(id && open)
	const { data, isLoading } = trpc.genre.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	const client = trpc.useContext()
	useEffect(() => {
		if (!data) return
		const timeoutId = setTimeout(() => {
			data.supGenres.forEach(async (genre) => {
				const data = await client.genre.get.fetch({ id: genre.id })
				data?.supGenres.forEach(genre => client.genre.miniature.prefetch({ id: genre.id }))
				data?.subGenres.forEach(genre => client.genre.miniature.prefetch({ id: genre.id }))
			})
			data.subGenres.forEach(async (genre) => {
				const data = await client.genre.get.fetch({ id: genre.id })
				data?.supGenres.forEach(genre => client.genre.miniature.prefetch({ id: genre.id }))
				data?.subGenres.forEach(genre => client.genre.miniature.prefetch({ id: genre.id }))
			})
		}, 1_000)
		return () => clearTimeout(timeoutId)
	}, [data])

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

	const { albums, artists, orphanTracks, tracks, id: deferredId } = useDeferredValue(data) || {}
	const loading = useDeferredValue(isLoading)
	const children = (
		<>
			<hr className={styles.hr} />
			{artists && Boolean(artists.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Artists</SectionTitle>
					<ArtistList key={deferredId} artists={artists} loading={loading} lines={artists.length >= 9 ? 3 : 1} />
				</>
			)}
			{albums && Boolean(albums.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
					<AlbumList key={deferredId} albums={albums} loading={loading} scrollable lines={albums.length >= 4 ? 2 : 1} />
				</>
			)}
			{orphanTracks && Boolean(orphanTracks.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
					<TrackList tracks={orphanTracks} />
				</>
			)}
		</>
	)

	const coverElement = (
		<GenreGraph
			id={id}
			name={name}
			genre={data}
			setId={setId}
		/>
	)

	const description = usePlaylistDescription({
		artistData: artists ?? [],
		length: tracks?.length,
	})
	const infos = [description]

	const parent = useRef<HTMLDivElement>(null)
	useImperativeHandle(ref, () => parent.current!)
	return (
		<Panel
			ref={parent}
			open={open}
			z={z}
			rect={rect}
			// description={data?.audiodb?.strDescriptionEN}
			coverElement={coverElement}
			coverPalette={data?.palette}
			infos={infos}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={""}
			isTop={isTop}
			overlay={false}
			longPressPlay={false}
		>
			{children}
		</Panel>
	)
})