import type { RefObject } from "react"
import useImagePalette from "./useImagePalette"
import Head from "next/head"

const defaultValues = {
	'--palette-bg-main': '#000',
	'--palette-bg-gradient': '#333',
	'--palette-secondary': '#ccc',
	'--palette-primary': '#fff',
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