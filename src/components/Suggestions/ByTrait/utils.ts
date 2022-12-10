import { startTransition } from "react"
import { COMBINED_FEATURES, FEATURES } from "./dictionaries"

export type Trait = {
	trait: keyof typeof FEATURES
	order: "asc" | "desc"
}

export type Option = {
	label: string,
	key: keyof typeof FEATURES, type: keyof typeof FEATURES[keyof typeof FEATURES]
}
export const options = Object.entries(FEATURES).map(([key, {asc, desc}]) => ([
	{label: asc.qualifier, key, type: "asc"},
	{label: desc.qualifier, key, type: "desc"},
])) as [Option, Option][]

function moustache(description: `${string}{{type}}${string}` | `{{Type}}${string}`, type: "tracks" | "albums") {
	const capitalized = type.charAt(0).toUpperCase() + type.slice(1)
	const replaceFirst = description.replace("{{Type}}", capitalized)
	const replaceOther = replaceFirst.replace("{{type}}", type)
	return replaceOther
}

export function titleFromSelectedOptions(options: Trait[], entity: "tracks" | "albums") {
	if (options.length === 1) {
		return moustache(FEATURES[options[0]!.trait][options[0]!.order].description, "tracks")
	}
	const exactMatch = COMBINED_FEATURES.find(({traits}) => {
		const entries = Object.entries(traits)
		if (entries.length !== options.length) {
			return false
		}
		return options.every(({trait, order}) => traits[trait] === order)
	})
	if (exactMatch) {
		return moustache(exactMatch.description, entity)
	}
	const list = [...options]
		.sort((a, b) => FEATURES[a.trait][a.order].listOrder - FEATURES[b.trait][b.order].listOrder)
	
	const words = list.map(({trait, order}, i, arr) => i === arr.length - 1 && "entity" in FEATURES[trait][order]
			// @ts-expect-error -- "entity" was tested to be present just above
			? FEATURES[trait][order].entity
			: FEATURES[trait][order].qualifier
		)
	
	if (!("entity" in FEATURES[list.at(-1)!.trait][list.at(-1)!.order])) {
		words.push(entity)
	}
	
	const sentence = words.join(" ")
	return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

export function selectionFromSelectedOptions(options: Trait[]) {
	return options.map(({trait, order}) => FEATURES[trait][order].qualifier)
}

export function addNewTraitByOption(setTraits: (cb: (prev?: Trait[] | undefined) => Trait[]) => void) {
	return (option: Option) => {
		navigator.vibrate(1)
		startTransition(() => {
			setTraits((traits = []) => {
				const clone = [...traits]
				const traitIndex = clone.findIndex(({trait}) => trait === option.key)
				if (traitIndex < 0 || clone[traitIndex]!.order !== option.type) {
					clone.push({trait: option.key, order: option.type})
				}
				if (traitIndex >= 0 && clone.length > 1) {
					clone.splice(traitIndex, 1)
				}
				return clone
			})
		})
	}
}