import Head from "next/head"
import { CSSProperties } from "react"

export type PaletteDefinition = [string, string, string, string]

const keys = [
	'--palette-bg-main',
	'--palette-bg-gradient',
	'--palette-secondary',
	'--palette-primary',
]

const defaultValues = [
	'#000',
	'#333',
	'#ccc',
	'#fff',
] as PaletteDefinition

export function paletteToCSSProperties(palette: PaletteDefinition): CSSProperties {
	return Object.fromEntries(keys.map((key, i) => [key, palette[i]]))
}

export default function Palette({
	palette = defaultValues,
}: {
	palette: PaletteDefinition
}) {
	return (
		<Head>
			<style key="palette-definition">
				{keys.map((key) => `\n@property ${key} {
					syntax: '<color>';
					inherits: true;
					initial-value: ${(defaultValues)[key as keyof typeof defaultValues]};
				}`).join('\n')}
			</style>
			<style key="palette-values">
				{`body {\n`}
				{palette.map((value, i) => `${keys[i]}: ${value};`).join("\n")}
				{`}\n`}
			</style>
		</Head>
	)
}