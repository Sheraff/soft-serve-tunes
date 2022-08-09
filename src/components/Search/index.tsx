import { Dispatch, SetStateAction, useMemo, useRef, useState } from "react"
import { trpc } from "../../utils/trpc"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"
import AlbumMiniature from "./AlbumMiniature"

const defaultArray = [] as never[]

export default function Search({
	setPlaylist
}: {
	setPlaylist: (type: string, name: string, id: string) => void
}) {
	const input = useRef<HTMLInputElement>(null)
	const [enabled, setEnabled] = useState(false)
	const {data: tracksRaw} = trpc.useQuery(["track.list"], {enabled})
	const {data: albumsRaw} = trpc.useQuery(["album.list"], {enabled})
	const {data: artistsRaw} = trpc.useQuery(["artist.list"], {enabled})
	const {data: genresRaw} = trpc.useQuery(["genre.list"], {enabled})

	const tracks = useAsyncInputStringDistance(input, tracksRaw || defaultArray)
	const albums = useAsyncInputStringDistance(input, albumsRaw || defaultArray)
	const artists = useAsyncInputStringDistance(input, artistsRaw || defaultArray)
	const genres = useAsyncInputStringDistance(input, genresRaw || defaultArray)

	return (
		<>
			<input
				ref={input}
				type="search"
				placeholder="Dee Dee Bridgewater Autumn Leaves"
				onFocus={!enabled ? (() => {setEnabled(true)}) : undefined}
			/>
			<div className={styles.results}>
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
			</div>
		</>
	)
}