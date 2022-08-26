import styles from "./AudioTest.module.css"
import Cover from "components/Cover"
import PlaylistViz from "components/PlaylistViz"
import Player from "components/Player"
import Header from "components/Header"
import Notification from "components/Notification"
import { useAppState } from "components/AppContext"
import useIndexedTRcpQuery from "client/db/useIndexedTRcpQuery"
import ArtistList from "./ArtistList"
import Palette from "./Palette"
import AlbumList from "./AlbumList"
import TrackList from "./TrackList"

function GlobalPalette() {
	const {playlist} = useAppState()

	const { data: list} = useIndexedTRcpQuery(["playlist.generate", {
		type: playlist?.type as string,
		id: playlist?.id as string,
	}], {
		enabled: Boolean(playlist?.type && playlist?.id)
	})
	
	const item = !list || !playlist ? undefined : list[playlist.index]

	const { data } = useIndexedTRcpQuery(["track.miniature", {
		id: item?.id as string
	}], {
		enabled: Boolean(item?.id),
	})

	return (
		<Palette
			palette={data?.cover ? JSON.parse(data.cover.palette) : undefined}
		/>
	)
}

function NowPlaying() {
	return (
		<div className={styles.content}>
			<Cover />
			<PlaylistViz />
		</div>
	)
}

function Suggestions(){
	const {data: artistFavs = []} = useIndexedTRcpQuery(["artist.most-fav"])
	const {data: artistRecent = []} = useIndexedTRcpQuery(["artist.most-recent-listen"])
	const {data: artistNewest = []} = useIndexedTRcpQuery(["artist.most-recent-add"])
	const {data: albumFavs = []} = useIndexedTRcpQuery(["album.most-fav"])
	const {data: albumRecent = []} = useIndexedTRcpQuery(["album.most-recent-listen"])
	const {data: albumNewest = []} = useIndexedTRcpQuery(["album.most-recent-add"])
	const {data: trackDanceable = []} = useIndexedTRcpQuery(["track.most-danceable"])
	const {data: albumDanceable = []} = useIndexedTRcpQuery(["album.most-danceable"])
	console.log('track danceable', trackDanceable)
	console.log('album danceable', albumDanceable)
	return (
		<div className={styles.center}>
			<div className={styles.centerChildren}>
				<h2>Favorite artists</h2>
				<ArtistList artists={artistFavs} lines={1} />
				<h2>Recently listened albums</h2>
				<AlbumList albums={albumRecent} lines={1} scrollable />
				<h2>Danceable tracks</h2>
				<TrackList tracks={trackDanceable} />
				<h2>Danceable albums</h2>
				<AlbumList albums={albumDanceable} lines={1} scrollable />
				<h2>Recently listened artists</h2>
				<ArtistList artists={artistRecent} lines={1} />
				<h2>Favorite albums</h2>
				<AlbumList albums={albumFavs} lines={1} scrollable />
				<h2>Newest artists</h2>
				<ArtistList artists={artistNewest} lines={1} />
				<h2>Newest albums</h2>
				<AlbumList albums={albumNewest} lines={1} scrollable />
			</div>
		</div>
	)
}

export default function AudioTest() {
	const {main} = useAppState()
	return (
		<>
			<div className={styles.container}>
				<Header/>
					{main.type === "home" && (
						<NowPlaying />
					)}
					{main.type === "suggestions" && (
						<Suggestions />
					)}
				<Player />
			</div>
			<GlobalPalette />
			<Notification />
		</>
	)
}