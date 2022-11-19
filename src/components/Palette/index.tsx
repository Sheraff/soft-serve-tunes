import Head from "next/head"
import { CSSProperties } from "react"

export type PaletteDefinition = [string, string, string, string]

const keys = [
	'--palette-bg-main',
	'--palette-bg-gradient',
	'--palette-secondary',
	'--palette-primary',
] as const

const defaultValues = [
	'#0d0110',
	'#300a38',
	'#b145c7',
	'#e6dde9',
] as PaletteDefinition

export function paletteToCSSProperties(palette: PaletteDefinition) {
	return Object.fromEntries(
		keys.map((key, i) => [key, palette[i]])
	) as unknown as CSSProperties & {[key in typeof keys[number]]: string}
}

export default function Palette({
	palette = defaultValues,
}: {
	palette: PaletteDefinition
}) {
	return (
		<Head>
			<style key="palette-definition">
				{keys.map((key, i) => `
					@property ${key} {
						syntax: '<color>';
						inherits: true;
						initial-value: ${defaultValues[i]};
					}
				`).join('')}
			</style>
			<style key="palette-values">
				{`body {\n`}
				{palette.map((value, i) => `${keys[i]}: ${value};`).join("\n")}
				{`}\n`}
			</style>
			<meta name="theme-color" content={palette[0]} />
		</Head>
	)
}