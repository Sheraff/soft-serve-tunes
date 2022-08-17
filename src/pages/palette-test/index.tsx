import { CSSProperties, useRef } from "react"
import useImagePalette from "../../components/Palette/useImagePalette"
import { trpc } from "../../utils/trpc"
import styles from "./index.module.css"

const TEST_ALBUM_IDS = [
	"cl6vtpxy2289529euy4iluq05yv", // ratatat "magnifique": black & white
	"cl6vtmkqd31802euy4c720dwvg", // black eyed peas "elephunk": background should be green-blue, not dark blue
	"cl6vtmu8w50929euy4xttfpg6j", // chilly gonzales "ivory": beige / grey / red / black
	"cl6vtmkb031065euy407ta575z", // billie eilish "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?": black / brown / grey / beige
	"cl6vtmjw030142euy41xndlgq6", // big soul "funky beats": blue / [black, white, orange-red] in any order that works for contrast
	"cl6vtsh33337589euy4dj5vdmml", // snarky puppy "family dinner": beige / ? / red / blue
	"cl6vtsh4u337626euy4bdgd2tx1", // snarky puppy "tell your friends": white should be main color (first in order => background main)
	"cl6vtmtdo47924euy4n90chfs2", // caravan palace "panic": (maybe) there should be some red in the palette (it's the 5th color, just bad luck, it's fine)
]

function SingleTest({id}: {id: string}) {
	const ref = useRef<HTMLImageElement>(null)
	const palette = useImagePalette({ref, defaultValues: {}})
	const {data} = trpc.useQuery(["album.miniature", {id}])

	let imgSrc = ""
	if (data?.spotify?.imageId) {
		imgSrc = data.spotify.imageId
	} else if (data?.audiodb?.thumbHqId) {
		imgSrc = data.audiodb.thumbHqId
	} else if (data?.audiodb?.thumbId) {
		imgSrc = data.audiodb.thumbId
	} else if (data?.lastfm?.coverId) {
		imgSrc = data.lastfm.coverId
	} else if (data?.tracks?.[0]?.metaImageId) {
		imgSrc = data.tracks[0].metaImageId
	}

	return (
		<div className={styles.item}>
			<div style={{'--color': palette['--palette-bg-main']} as CSSProperties}></div>
			<div style={{'--color': palette['--palette-bg-gradient']} as CSSProperties}></div>
			<div style={{'--color': palette['--palette-secondary']} as CSSProperties}></div>
			<div style={{'--color': palette['--palette-primary']} as CSSProperties}></div>
			<img
				src={`/api/cover/${imgSrc}`}
				alt=""
				ref={ref}
			/>
			<span style={{
				'--bg': palette['--palette-bg-main'],
				'--color': palette['--palette-primary'],
				'--border': palette['--palette-secondary'],
			}}>test</span>
		</div>
	)
}

export default function PaletteTest() {
	return (
		<div className={styles.root}>
			{TEST_ALBUM_IDS.map((id) => (
				<SingleTest key={id} id={id} />
			))}
		</div>
	)
}