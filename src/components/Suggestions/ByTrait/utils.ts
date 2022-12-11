import { startTransition } from "react"
import { COMBINED_FEATURES, FEATURES } from "./dictionaries"

type GenericTrait<T extends keyof typeof FEATURES> = {
	trait: T
	value: keyof typeof FEATURES[T]
}

export type Trait = GenericTrait<keyof typeof FEATURES>

export type Option = {
	label: string,
	key: keyof typeof FEATURES,
	value: keyof typeof FEATURES[keyof typeof FEATURES],
}

export const options = Object.entries(FEATURES).map(
	([key, targets]) => (Object.entries(targets).map(
		([value, {qualifier}]) => ({key, label: qualifier, value})
	).sort(({value: a}, {value: b}) => Number(a) - Number(b)))
) as [Option, Option, ...Option[]][]

function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

function moustache(
	description: string,
	type: "tracks" | "albums",
	fillers: Trait[] = []
) {
	const re = /\{\{([a-z]+)\}\}/i
	let match: RegExpMatchArray | null
	let replaced = description as string
	while ((match = replaced.match(re)) !== null) {
		const [full, trait] = match
		if (!trait) continue
		const traitName = trait.toLowerCase()
		if (traitName === "type") {
			replaced = replaced.replace(full, type)
		} else {
			const fillerTrait = fillers.find(({trait}) => trait === traitName)
			if (fillerTrait) {
				const qualifier = FEATURES[fillerTrait.trait][fillerTrait.value]!.qualifier
				replaced = replaced.replace(full, qualifier)
			} else {
				replaced = replaced.replace(full, "")
			}
		}
	}
	const trimmed = replaced.replaceAll(/\s+/g, " ").trim()
	return capitalize(trimmed)
}

export function titleFromSelectedOptions(options: Trait[], entity: "tracks" | "albums") {
	const exactMatch = COMBINED_FEATURES.find(({traits, ignore = []}) => {
		const filtered = options.filter(({trait}) => !ignore.includes(trait))
		const entries = Object.entries(traits)
		if (entries.length !== filtered.length) {
			return false
		}
		return filtered.every(({trait, value}) => traits[trait] === value)
	})
	if (exactMatch) {
		return moustache(exactMatch.description, entity, options)
	}
	const list = [...options]
		.sort((a, b) => FEATURES[a.trait][a.value].listOrder - FEATURES[b.trait][b.value].listOrder)
	
	const words = list.map(({trait, value}, i, arr) => i === arr.length - 1 && "entity" in FEATURES[trait][value]
			// @ts-expect-error -- "entity" was tested to be present just above
			? FEATURES[trait][value].entity
			: FEATURES[trait][value].qualifier
		)
	
	if (!("entity" in FEATURES[list.at(-1)!.trait][list.at(-1)!.value])) {
		words.push(entity)
	}
	
	const sentence = words.join(" ")
	return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

export function selectionFromSelectedOptions(options: Trait[]) {
	return options.map(({trait, value}) => FEATURES[trait][value].qualifier)
}

export function addNewTraitByOption(setTraits: (cb: (prev?: Trait[] | undefined) => Trait[]) => void) {
	return (option: Option) => {
		navigator.vibrate(1)
		startTransition(() => {
			setTraits((traits = []) => {
				const clone = [...traits]
				const traitIndex = clone.findIndex(({trait}) => trait === option.key)
				if (traitIndex < 0 || clone[traitIndex]!.value !== option.value) {
					clone.push({trait: option.key, value: option.value})
				}
				if (traitIndex >= 0 && clone.length > 1) {
					clone.splice(traitIndex, 1)
				}
				return clone
			})
		})
	}
}