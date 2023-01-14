import { type CSSProperties, useEffect, useRef, useState } from "react"
import extractPaletteFromUint8, { type PaletteDefinition } from "utils/paletteExtraction"
import { paletteToCSSProperties } from "components/Palette"
import { trpc } from "utils/trpc"
import styles from "./index.module.css"

const TEST_ALBUM_IDS = [
	"cl9yay4ok24214dy4qzpaydny", // amy winehouse "back to black": should have white foreground, distinguishable colors
		// "cl6vtpxy2289529euy4iluq05yv", // ratatat "magnifique": black & white
	"cl9yazcok45274dy4tlhelk8o", // black eyed peas "elephunk": background should be green-blue, not dark blue
		// "cl6vtmu8w50929euy4xttfpg6j", // chilly gonzales "ivory": beige / grey / red / black
	"cl9yayyzk38414dy4k4ergi4k", // billie eilish "WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?": black / brown / grey / beige
		// "cl6vtmjw030142euy41xndlgq6", // big soul "funky beats": blue / [black, white, orange-red] in any order that works for contrast
		// "cl6vtsh33337589euy4dj5vdmml", // snarky puppy "family dinner": beige / ? / red / blue
		// "cl6vtsh4u337626euy4bdgd2tx1", // snarky puppy "tell your friends": white should be main color (first in order => background main)
		// "cl6vtmtdo47924euy4n90chfs2", // caravan palace "panic": (maybe) there should be some red in the palette (it's the 5th color, just bad luck, it's fine)
	"cl9yb7w7n182714dy4dntkxxkf", // yann tiersen "good bye lenin"
	"cl9yb0hfy60914dy4i4y1iqq5", // ice nine kills
	"cl9yawbln02444dy4exzc99dp", // birds of prey
	"cl9yb5rzy146834dy48c7eqnoh", // tzu computer love
	"cl9yb0y5c68014dy4hwf2cnch", // metronomy
	"cl9yb3cwc105394dy4qmndtcpy", // roadrunner united
	"cl9yb0mj562134dy4re44v5xc", // maroon 5 songs about jane
	"cl9yb5f6i141014dy43dwiizze", // two door cinema club tourist history
]



function SingleTest({id}: {id: string}) {
	const {data} = trpc.album.miniature.useQuery({id})

	const img = data?.cover
	// const palette = img?.palette ? JSON.parse(img.palette) : []

	const [palette, setPalette] = useState<PaletteDefinition>([
		{h: 0, s: 0, l: 0},
		{h: 0, s: 0, l: 0},
		{h: 0, s: 0, l: 0},
		{h: 0, s: 0, l: 0},
	])

	const ref = useRef<HTMLImageElement>(null)
	useEffect(() => {
		const controller = new AbortController()
		const img = ref.current!
		img.addEventListener("load", () => {
			const cut = 0.05
			const side = 300
			const canvas = document.createElement("canvas")
			canvas.height = side
			canvas.width = side
			const context = canvas.getContext("2d")
			context!.drawImage(
				img,
				img.naturalWidth * cut,
				img.naturalHeight * cut,
				img.naturalWidth * (1 - 2 * cut),
				img.naturalHeight * (1 - 2 * cut),
				0,
				0,
				side,
				side
			)
			const imgData = context!.getImageData(
				side * 0,
				side * 0,
				side * 1,
				side * 1,
			)
			const buffer = imgData.data
			const palette = extractPaletteFromUint8(buffer, 4)
			setPalette(palette)
		})
		return () => {
			controller.abort()
		}
	}, [])

	const cssPalette = paletteToCSSProperties(palette)

	return (
		<div className={styles.item}>
			<div style={{"--color": cssPalette["--palette-bg-main"]} as CSSProperties}></div>
			<div style={{"--color": cssPalette["--palette-bg-gradient"]} as CSSProperties}></div>
			<div style={{"--color": cssPalette["--palette-secondary"]} as CSSProperties}></div>
			<div style={{"--color": cssPalette["--palette-primary"]} as CSSProperties}></div>
			<img
				ref={ref}
				src={`/api/cover/${img?.id}`}
				alt=""
			/>
			<span style={{
				"--bg": cssPalette["--palette-bg-main"],
				"--color": cssPalette["--palette-primary"],
				"--border": cssPalette["--palette-secondary"],
			} as CSSProperties}>test</span>
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