import type { RefObject } from "react"
import useImagePalette from "./useImagePalette"
import Head from "next/head"

const defaultValues = {
	'--palette-bg-main': 'hsl(330, 75%, 3%)',
	'--palette-bg-gradient': 'hsl(330, 70%, 13%)',
	'--palette-secondary': 'hsl(330, 84%, 60%)',
	'--palette-primary': 'hsl(330, 77%, 73%)',
	'--palette-contrast': '#000',
	'--complementary-bg-main': 'hsl(131, 75%, 3%)',
	'--complementary-bg-gradient': 'hsl(131, 70%, 13%)',
	'--complementary-secondary': 'hsl(131, 84%, 60%)',
	'--complementary-primary': 'hsl(131, 77%, 73%)',
}

export default function Palette({
	img,
}: {
	img: RefObject<HTMLImageElement>
}) {
	const palette = useImagePalette({ref: img})
	return (
		<>
		<Head>
			<style key="palette-definition">
				{Object.keys(palette).map((key) => `\n@property ${key} {
					syntax: '<color>';
					inherits: true;
					initial-value: ${(defaultValues)[key as keyof typeof defaultValues]};
				}`).join('\n')}
				{`body {\n`}
				{`transition: ${Object.keys(palette).map((key) => `${key} 500ms linear 100ms`).join(',\n\t')};\n`}
				{`}\n`}
			</style>
			<style key="palette-values">
				{`body {\n`}
				{Object.entries(palette).map(([key, value]) => `${key}: ${value};`).join("\n")}
				{`}\n`}
			</style>
		</Head>
		<div style={{
			display: 'flex',
			position: "fixed",
			top: 0,
			left: 0,
			width: "100%",
		}}>
			{Object.entries(palette).map(([key, value]) => (
				<div key={key} style={{
					height: "50px",
					flex: 1,
					backgroundColor: `var(${key})`,
				}} />
			))}
		</div>
		</>
	)
}