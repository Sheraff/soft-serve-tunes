import { type Prisma } from "@prisma/client"
import Head from "next/head"
import { type CSSProperties } from "react"
import { type PaletteDefinition } from "utils/paletteExtraction"

const keys = [
	"--palette-bg-main",
	"--palette-bg-gradient",
	"--palette-secondary",
	"--palette-primary",
] as const

const defaultValues = [
	{h:288, s:88, l:3},
	{h:290, s:70, l:13},
	{h:290, s:54, l:53},
	{h:285, s:21, l:89},
] as PaletteDefinition

function hslToCss(value: PaletteDefinition[number]) {
	return `hsl(${value.h}, ${value.s}%, ${value.l}%)`
}

function isPaletteDefinition(palette?: Prisma.JsonValue): palette is PaletteDefinition {
	return Boolean(palette)
}

type CSSPalette = CSSProperties & {[key in typeof keys[number]]: string}
export function paletteToCSSProperties(palette?: Prisma.JsonValue): CSSPalette {
	if (!isPaletteDefinition(palette)) {
		return paletteToCSSProperties(defaultValues)
	}
	return Object.fromEntries(
		palette.map((value, i) => [keys[i], hslToCss(value)])
	) as unknown as CSSPalette
}

export default function Palette({
	palette = defaultValues,
}: {
	palette?: PaletteDefinition & Prisma.JsonArray
}) {
	return (
		<Head>
			<style key="palette-definition">
				{defaultValues.map((value, i) => `
					@property ${keys[i]} {
						syntax: '<color>';
						inherits: true;
						initial-value: ${hslToCss(value)};
					}
				`).join("")}
			</style>
			<style key="palette-values">
				{"body {\n"}
				{palette.map((value, i) => `${keys[i]}: ${hslToCss(value)};`).join("\n")}
				{"transition: --palette-bg-main 600ms linear, --palette-primary 600ms linear;\n"}
				{"}\n"}
			</style>
			<meta name="theme-color" content={hslToCss(palette[0])} />
		</Head>
	)
}