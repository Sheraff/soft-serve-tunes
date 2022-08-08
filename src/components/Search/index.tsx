import { Dispatch, SetStateAction, useMemo, useRef, useState } from "react"
import { trpc } from "../../utils/trpc"
import useAsyncInputStringDistance from "./useAsyncInputFilter"
import styles from "./index.module.css"

const defaultArray = [] as never[]

export default function Search({
	setId
}: {
	setId: Dispatch<SetStateAction<string>>
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

	// console.log('result', result?.length)

	return (
		<>
			<input
				ref={input}
				type="search"
				placeholder="Dee Dee Bridgewater Autumn Leaves"
				// disabled={anyLoading}
				// onChange={e => setChar(e.target.value?.[0] ?? "")}
				onFocus={!enabled ? (() => {setEnabled(true)}) : undefined}
			/>
			<div className={styles.results}>
				<ul>
					{tracks.slice(0, 10).map(item => (
						<li key={item.id}>
							<button onClick={() => setId(item.id)}>
								{`${item.name} - ${item.artist?.name}`}
							</button>
						</li>
					))}
				</ul>
				<ul>
					{albums.slice(0, 10).map(item => (
						<li key={item.id}>
							<button onClick={() => setId(item.id)}>
								{`${item.name} - ${item.artist?.name}`}
							</button>
						</li>
					))}
				</ul>
				<ul>
					{artists.slice(0, 10).map(item => (
						<li key={item.id}>
							<button onClick={() => setId(item.id)}>
								{`${item.name} (${item._count.albums} albums)`}
							</button>
						</li>
					))}
				</ul>
				<ul>
					{genres.slice(0, 10).map(item => (
						<li key={item.id}>
							<button onClick={() => setId(item.id)}>
								{`${item.name} (${item._count.tracks} tracks)`}
							</button>
						</li>
					))}
				</ul>
			</div>
		</>
	)
}