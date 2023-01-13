import { type ForwardedRef, forwardRef, useDeferredValue, useMemo } from "react"
import pluralize from "utils/pluralize"
import AlbumList from "components/AlbumList"
import { artistView } from "components/AppContext"
import styles from "./index.module.css"
import SectionTitle from "atoms/SectionTitle"
import TrackList from "components/TrackList"
import { trpc } from "utils/trpc"
import { useMakePlaylist } from "client/db/useMakePlaylist"
import PlaylistList from "components/PlaylistList"
import Panel from "../Panel"

export default forwardRef(function ArtistView({
	open,
	id,
	z,
}: {
	open: boolean
	id: string
	z: number
}, ref: ForwardedRef<HTMLDivElement>) {
	const artist = artistView.useValue()

	const enabled = Boolean(id && artist.open)
	const {data, isLoading} = trpc.artist.get.useQuery({id}, {
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

	const makePlaylist = useMakePlaylist()
	const onClickPlay = () => {
		const playlistName = !data
			? "New Playlist"
			: data.name
		makePlaylist({type: "artist", id}, playlistName)
	}

	const albums = useDeferredValue(data?.albums)
	const tracks = useDeferredValue(data?.tracks)
	const playlists = useDeferredValue(data?.playlists)
	const children = (
		<>
			{useMemo(() => albums && Boolean(albums.length) && (
				<>
					<SectionTitle className={styles.sectionTitle}>Albums</SectionTitle>
					<AlbumList albums={albums} loading={isLoading} />
				</>
			), [albums, isLoading])}
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
			view={artist}
			description={data?.audiodb?.strBiographyEN}
			cover={data?.cover}
			infos={infos}
			title={data?.name}
			onClickPlay={onClickPlay}
			animationName={styles["bubble-open"]}
		>
			{children}
		</Panel>
	)
})