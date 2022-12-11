
export const FEATURES = {
	danceability: {
		asc: {
			qualifier: "hectic",
			description: "Lackadaisical {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "rhythmic",
			description: "{{Type}} with infectious beats",
			listOrder: 5,
			entity: "beats"
		},
	},
	energy: {
		asc: {
			qualifier: "mellow",
			description: "{{Type}} to relax to",
			listOrder: 2,
		},
		desc: {
			qualifier: "energetic",
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
			qualifier: "minimal",
			description: "Minimalist {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "orchestral",
			description: "Atmospheric {{type}}",
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
			qualifier: "somber",
			description: "Melancholic {{type}}",
			listOrder: 2,
		},
		desc: {
			qualifier: "upbeat",
			description: "Cheerful {{type}}",
			listOrder: 2,
		},
	},
	speechiness: {
		asc: {
			qualifier: "melodic",
			description: "Melodic {{type}}",
			listOrder: 2,
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
		traits: {danceability: "desc", speechiness: "desc"},
		description: "Grooviest prose",
	},
	// {
	// 	traits: {energy: "asc",speechiness: "desc"},
	// 	description: "Smooth songs",
	// },
	// {
	// 	traits: {speechiness: "asc", instrumentalness: "asc", danceability: "desc"},
	// 	description: "{{Type}} for karaoke",
	// },
	{
		traits: {instrumentalness: "asc", danceability: "desc", energy: "desc", valence: "desc"},
		description: "{{Type}} for a party",
	},
	{
		traits: {energy: "desc", acousticness: "asc", valence: "desc"},
		ignore: ["danceability", "liveness"],
		description: "High-energy {{danceability}} {{liveness}} {{type}}",
	},
	{
		traits: {energy: "desc", acousticness: "asc", valence: "asc"},
		ignore: ["danceability", "liveness"],
		description: "{{Danceability}} emo {{liveness}} {{type}}",
	},
	{
		traits: {energy: "asc", acousticness: "desc", valence: "asc"},
		ignore: ["danceability", "liveness", "instrumentalness", "speechiness"],
		description: "{{Danceability}} {{speechiness}} {{instrumentalness}} {{liveness}} ballads",
	},
] as {
	traits: {[key in keyof typeof FEATURES]?: "asc" | "desc"}
	description: `${string}{{type}}${string}` | `{{Type}}${string}`
	ignore?: (keyof typeof FEATURES)[]
}[]