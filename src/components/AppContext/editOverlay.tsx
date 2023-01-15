import globalState from "./globalState"

type EditOverlay = {
	type: "artist" | "album" | "track" | "playlist" | "genre" | null
	selection: {
		id: string
		type: "artist" | "album" | "track" | "playlist" | "genre"
	}[]
}

export const editOverlay = globalState<EditOverlay>("editOverlay", {type: null, selection: []})

export function editOverlaySetter(item: EditOverlay["selection"][number] | null) {
	return (prev: EditOverlay) => {
		if (item === null) {
			return {
				type: null,
				selection: [],
			}
		}
		if (prev.type !== null && prev.type !== item.type) {
			return {
				type: item.type,
				selection: [item],
			}
		}
		const index = prev.selection.findIndex((i) => i.id === item.id && i.type === item.type)
		if (index >= 0) {
			const nextSelection = prev.selection.filter((_, i) => i !== index)
			return {
				type: nextSelection.length ? prev.type : null,
				selection: nextSelection,
			}
		}
		return {
			type: item.type,
			selection: [...prev.selection, item],
		}
	}
}
