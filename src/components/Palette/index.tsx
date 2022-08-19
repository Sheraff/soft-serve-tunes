import type { CSSProperties, RefObject } from "react"
import useImagePalette from "./useImagePalette"
import Head from "next/head"

const defaultValues = {
	'--palette-bg-main': '#000',
	'--palette-bg-gradient': '#333',
	'--palette-secondary': '#ccc',
	'--palette-primary': '#fff',
} as CSSProperties

export default function Palette({
	img,
}: {
	img: RefObject<HTMLImageElement>
}) {
	const palette = useImagePalette({ref: img, defaultValues})
	return (
		<Head>
			<style key="palette-definition">
				{Object.keys(palette).map((key) => `\n@property ${key} {
					syntax: '<color>';
					inherits: true;
					initial-value: ${(defaultValues)[key as keyof typeof defaultValues]};
				}`).join('\n')}
				{/* {`*, *::before, *::after {\n`}
				{`transition: ${Object.keys(palette).map((key) => `${key} 400ms`).join(',\n\t')};\n`}
				{`}\n`} */}
			</style>
			<style key="palette-values">
				{`body {\n`}
				{Object.entries(palette).map(([key, value]) => `${key}: ${value};`).join("\n")}
				{`}\n`}
			</style>
		</Head>
	)
}