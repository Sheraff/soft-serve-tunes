import SectionTitle from "atoms/SectionTitle"
import AlbumList from "components/AlbumList"
import { useIsHome } from "components/AppContext"
import ArtistList from "components/ArtistList"
import GenreList from "components/GenreList"
import PlaylistList from "components/PlaylistList"
import { memo, Suspense } from "react"
import { trpc } from "utils/trpc"
import AlbumsByTraitSuggestion from "./ByTrait/AlbumSuggestion"
import TracksByTraitSuggestion from "./ByTrait/TrackSuggestion"
import styles from "./index.module.css"

export default memo(function Suggestions () {

	const enabled = useIsHome()

	const { data: artistFavs = [], isLoading: artistFavsLoading } = trpc.artist.mostFav.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: artistRecent = [], isLoading: artistRecentLoading } = trpc.artist.mostRecentListen.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: artistLongTime = [], isLoading: artistLongTimeLoading } = trpc.artist.leastRecentListen.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: albumFavs = [], isLoading: albumFavsLoading } = trpc.album.mostFav.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: albumRecent = [], isLoading: albumRecentLoading } = trpc.album.mostRecentListen.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: albumNewest = [], isLoading: albumNewestLoading } = trpc.album.mostRecentAdd.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: genreFavs = [] } = trpc.genre.mostFav.useQuery(undefined, { enabled, keepPreviousData: true })
	const { data: playlists = [] } = trpc.playlist.list.useQuery(undefined, {
		enabled,
		keepPreviousData: true,
		select (playlists) {
			return playlists.slice(0, 4)
		}
	})

	return (
		<div className={styles.scrollable}>
			<div className={styles.main}>
				<div className={styles.section}>
					<SectionTitle>Recently listened artists</SectionTitle>
					<ArtistList artists={artistRecent} lines={1} loading={artistRecentLoading} />
				</div>
				<div className={styles.section}>
					<Suspense fallback={
						<>
							<SectionTitle> </SectionTitle>
							<AlbumList albums={[]} lines={1} scrollable loading />
						</>
					}>
						<AlbumsByTraitSuggestion />
					</Suspense>
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite genres</SectionTitle>
					<GenreList genres={genreFavs} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Recently listened albums</SectionTitle>
					<AlbumList albums={albumRecent} lines={1} scrollable loading={albumRecentLoading} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite artists</SectionTitle>
					<ArtistList artists={artistFavs} lines={1} loading={artistFavsLoading} />
				</div>
				{playlists.length > 0 && (
					<div className={styles.section}>
						<SectionTitle>Recent playlists</SectionTitle>
						<PlaylistList playlists={playlists} />
					</div>
				)}
				<div className={styles.section}>
					<Suspense>
						<TracksByTraitSuggestion />
					</Suspense>
				</div>
				<div className={styles.section}>
					<SectionTitle>Favorite albums</SectionTitle>
					<AlbumList albums={albumFavs} lines={1} scrollable loading={albumFavsLoading} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Artists not played in a while</SectionTitle>
					<ArtistList artists={artistLongTime} lines={1} loading={artistLongTimeLoading} />
				</div>
				<div className={styles.section}>
					<SectionTitle>Newest albums</SectionTitle>
					<AlbumList albums={albumNewest} lines={1} scrollable loading={albumNewestLoading} />
				</div>
			</div>
		</div>
	)
})