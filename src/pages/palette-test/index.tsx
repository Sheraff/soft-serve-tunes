import { CSSProperties } from "react"
import { trpc } from "utils/trpc"
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
	const {data} = trpc.useQuery(["album.miniature", {id}])

	const img = data?.cover
	const palette = img?.palette ? JSON.parse(img.palette) : []

	return (
		<div className={styles.item}>
			<div style={{'--color': palette[0]} as CSSProperties}></div>
			<div style={{'--color': palette[1]} as CSSProperties}></div>
			<div style={{'--color': palette[2]} as CSSProperties}></div>
			<div style={{'--color': palette[3]} as CSSProperties}></div>
			<img
				src={`/api/cover/${img?.id}`}
				alt=""
			/>
			<span style={{
				'--bg': palette[0],
				'--color': palette[3],
				'--border': palette[2],
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