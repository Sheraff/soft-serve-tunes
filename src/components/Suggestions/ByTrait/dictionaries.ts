
export const FEATURES = {
	danceability: {
		asc: {
			qualifier: "hectic",
			description: "Hectic {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "beats",
			description: "{{Type}} with the strongest beat",
			listOrder: 5,
			entity: "beats"
		},
	},
	energy: {
		asc: {
			qualifier: "chill",
			description: "{{Type}} to relax to",
			listOrder: 2,
		},
		desc: {
			qualifier: "high-octane",
			description: "High-octane {{type}}",
			listOrder: 2,
		},
	},
	acousticness: {
		asc: {
			qualifier: "electric",
			description: "Electric {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "acoustic",
			description: "Acoustic {{type}}",
			listOrder: 2,
		},
	},
	instrumentalness: {
		asc: {
			qualifier: "lyrical",
			description: "Lyrical {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "instrumental",
			description: "Instrumental {{type}}",
			listOrder: 2,
		},
	},
	liveness: {
		asc: {
			qualifier: "studio",
			description: "{{Type}} recorded in a studio",
			listOrder: 3,
		},
		desc: {
			qualifier: "live",
			description: "{{Type}} performed live",
			listOrder: 1,
		},
	},
	valence: {
		asc: {
			qualifier: "depressed",
			description: "Depressing {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "euphoric",
			description: "Cheerful {{type}}",
			listOrder: 2,
		},
	},
	speechiness: {
		asc: {
			qualifier: "singing",
			description: "{{Type}} to sing along",
			listOrder: 4,
		},
		desc: {
			qualifier: "prose",
			description: "{{Type}} with the best flow",
			listOrder: 4,
			entity: "prose"
		},
	},
} as const

export const COMBINED_FEATURES = [
	{
		traits: {danceability: "desc", energy: "desc"},
		description: "{{Type}} for clubbing",
	},
	{
		traits: {acousticness: "asc", energy: "desc"},
		description: "{{Type}} for headbanging",
	},
	{
		traits: {danceability: "desc", energy: "desc", acousticness: "asc"},
		description: "{{Type}} for a rave",
	},
	{
		traits: {speechiness: "asc", instrumentalness: "asc", danceability: "desc"},
		description: "{{Type}} for karaoke",
	},
	{
		traits: {instrumentalness: "asc", danceability: "desc", energy: "desc", valence: "desc"},
		description: "{{Type}} for a party",
	},
] as {
	traits: {[key in keyof typeof FEATURES]?: "asc" | "desc"}
	description: `${string}{{type}}${string}` | `{{Type}}${string}`
}[]