import classNames from "classnames"
import { type RouterOutputs, trpc } from "utils/trpc"
import styles from "./index.module.css"
import Image from "atoms/Image"

type AlbumMiniature = Exclude<RouterOutputs["album"]["miniature"], null>

export default function CoverImages ({
	albums = [],
	className,
}: {
	albums?: { id: string }[]
	className?: string
}) {
	const { albumData = [] } = trpc
		.useQueries((t) => albums.map(({ id }) => t.album.miniature({ id })))
		.reduce<{
			albumData: AlbumMiniature[]
		}>((acc, { data }) => {
			if (data?.cover) {
				acc.albumData.push(data)
			}
			return acc
		}, { albumData: [] })

	return (
		<div className={classNames(styles.main, className, styles[`count-${albumData.length}` as keyof typeof styles])}>
			{albumData.map((album) => (
				<Image
					key={album.id}
					className={styles.img}
					cover={album.cover}
					size={albumData.length > 4 ? "half" : "full"}
				/>
			))}
		</div>
	)
}