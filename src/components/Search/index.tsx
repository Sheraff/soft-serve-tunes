import { useRef, useState } from "react"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"
import AlbumMiniature from "./AlbumMiniature"
import useIndexedTRcpQuery from "../../client/db/useIndexedTRcpQuery"
import { ListType } from "../AudioTest"

const defaultArray = [] as never[]

export default function Search({
	setPlaylist
}: {
	setPlaylist: (type: ListType, name: string, id: string) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [enabled, setEnabled] = useState(false)

	const {data: tracksRaw} = useIndexedTRcpQuery(["track.list"], {enabled})
	const {data: albumsRaw} = useIndexedTRcpQuery(["album.list"], {enabled})
	const {data: artistsRaw} = useIndexedTRcpQuery(["artist.list"], {enabled})
	const {data: genresRaw} = useIndexedTRcpQuery(["genre.list"], {enabled})

	const tracks = useAsyncInputStringDistance(input, tracksRaw || defaultArray)
	const albums = useAsyncInputStringDistance(input, albumsRaw || defaultArray)
	const artists = useAsyncInputStringDistance(input, artistsRaw || defaultArray)
	const genres = useAsyncInputStringDistance(input, genresRaw || defaultArray)

	return (
		<div>
			<input
				ref={input}
				type="search"
				placeholder="Dee Dee Bridgewater Autumn Leaves"
				onFocus={!enabled ? (() => {setEnabled(true)}) : undefined}
			/>
			<div className={styles.results}>
				{Boolean(tracks.length) && (
					<ul>
						{tracks.slice(0, 10).map(item => (
							<li key={item.id}>
								<button
									className={styles.basic}
									onClick={() => setPlaylist("track", item.name, item.id)}
									title={item.name}
								>
									{`${item.name} - ${item.artist?.name}`}
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(albums.length) && (
					<ul className={styles.miniatures}>
						{albums.slice(0, 9).map(item => (
							<li key={item.id}>
								<button
									onClick={() => setPlaylist("album", item.name, item.id)}
									title={item.name}
								>
									<AlbumMiniature id={item.id} />
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(artists.length) && (
					<ul className={styles.miniatures}>
						{artists.slice(0, 9).map(item => (
							<li key={item.id}>
								<button
									onClick={() => setPlaylist("artist", item.name, item.id)}
									title={item.name}
								>
									<AlbumMiniature id={item.albums[0]?.id} />
								</button>
							</li>
						))}
					</ul>
				)}
				{Boolean(genres.length) && (
					<ul>
						{genres.slice(0, 10).map(item => (
							<li key={item.id}>
								<button
									className={styles.basic}
									onClick={() => setPlaylist("genre", item.name, item.id)}
									title={item.name}
								>
									{`${item.name} (${item._count.tracks} tracks)`}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	)
}