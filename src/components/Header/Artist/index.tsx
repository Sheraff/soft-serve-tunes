import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import pluralize from "utils/pluralize"
import AlbumList from "components/AlbumList"
import styles from "./index.module.css"
import SectionTitle from "atoms/SectionTitle"
import TrackList from "components/TrackList"
import { trpc } from "utils/trpc"
import { setPlaylist } from "client/db/useMakePlaylist"
import PlaylistList from "components/PlaylistList"
import Panel from "../Panel"
import { autoplay } from "components/Player/Audio"

export default forwardRef(function ArtistView ({
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
	const { data, isLoading } = trpc.artist.get.useQuery({ id }, {
		enabled,
		keepPreviousData: true,
	})

	const infos = []
	if (data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear) {
		infos.push(`${data?.audiodb?.intFormedYear || data?.audiodb?.intBornYear}`)
	}
	if (data?._count?.albums) {
		infos.push(`${data._count.albums} album${pluralize(data._count.albums)}`)
	}
	if (data?._count?.tracks) {
		infos.push(`${data._count.tracks} track${pluralize(data._count.tracks)}`)
	}

	const onClickPlay = () => {
		if (!data) return


		const tracks: Parameters<typeof setPlaylist>[1] = []
		const albumTrackIdsSet = new Set<string>()

		if (data.albums) for (const album of data.albums) {
			for (const track of album.tracks) {
				if (albumTrackIdsSet.has(track.id)) continue
				albumTrackIdsSet.add(track.id)
				tracks.push({
					id: track.id,
					name: track.name,
					artist: track.artist,
					album: {
						id: album.id,
						name: album.name,
					},
				})
			}
		}
		if (data.featured) for (const album of data.featured) {
			for (const track of album.tracks) {
				if (albumTrackIdsSet.has(track.id)) continue
				if (track.artist?.id !== id) continue
				albumTrackIdsSet.add(track.id)
				tracks.push({
					id: track.id,
					name: track.name,
					artist: track.artist,
					album: {
						id: album.id,
						name: album.name,
					},
				})
			}
		}
		if (data.tracks) for (const track of data.tracks) {
			if (albumTrackIdsSet.has(track.id)) return
			albumTrackIdsSet.add(track.id)
			tracks.push({
				id: track.id,
				name: track.name,
				artist: track.artist,
				album: null,
			})
		}

		setPlaylist(data.name, tracks)
		autoplay.setState(true)
	}

	const { albums, featured, tracks, playlists } = useDeferredValue(data) || {}
	const children = (
		<>
			{useMemo(() => albums && Boolean(albums.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
					<AlbumList albums={albums} loading={isLoading} />
				</>
			), [albums, isLoading])}
			{useMemo(() => featured && Boolean(featured.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Featured on</SectionTitle>
					<AlbumList albums={featured} loading={isLoading} />
				</>
			), [featured, isLoading])}
			{useMemo(() => tracks && Boolean(tracks.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Tracks</SectionTitle>
					<TrackList tracks={tracks} />
				</>
			), [tracks])}
			{useMemo(() => playlists && Boolean(playlists.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Playlists</SectionTitle>
					<PlaylistList playlists={playlists} />
				</>
			), [playlists])}
		</>
	)

	return (
		<Panel
			ref={ref}
			open={open}
			z={z}
			rect={rect}
			description={data?.audiodb?.strBiographyEN}
			coverId={data?.cover?.id}
			coverPalette={data?.cover?.palette}
			infos={infos}
			title={data?.name ?? name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
			isTop={isTop}
		>
			{children}
		</Panel>
	)
})