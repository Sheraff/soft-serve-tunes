
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
	// chatGPT generated
	{
		traits: {energy: "desc", valence: "desc", acousticness: "asc"},
		description: "Energetic {{type}} for getting pumped up",
	},
	{
		traits: {energy: "asc", acousticness: "desc", valence: "asc", instrumentalness: "desc"},
		description: "Soothing {{type}} for relaxation",
	},
	{
		traits: {energy: "desc", danceability: "desc", valence: "desc", speechiness: "asc"},
		description: "Upbeat {{type}} for a road trip",
	},
	{
		traits: {energy: "asc", acousticness: "desc", valence: "asc", instrumentalness: "asc"},
		description: "Introspective {{type}} for a rainy day",
	},
	{
		traits: {energy: "desc", danceability: "desc", valence: "desc", liveness: "desc"},
		description: "Fiery {{type}} for a dance-off",
	},
	{
		traits: {energy: "asc", acousticness: "asc", valence: "desc", instrumentalness: "asc"},
		description: "Chill {{type}} for a beach bonfire",
	},
	{
		traits: {energy: "desc", acousticness: "asc", valence: "desc", speechiness: "asc"},
		description: "Melodic {{type}} for a sing-along",
	},
	{
		traits: {danceability: "desc", energy: "desc", valence: "desc", speechiness: "asc"},
		description: "Funkalicious {{type}} for a funky good time",
	},
	{
		traits: {danceability: "desc", energy: "desc", valence: "desc", acousticness: "asc", instrumentalness: "asc"},
		description: "Old-school {{type}} for a throwback party",
	},
	{
		traits: {energy: "asc", acousticness: "asc", valence: "asc", instrumentalness: "desc", speechiness: "asc"},
		description: "Dreamy {{type}} for a dreamy vibe",
	},
	{
		traits: {danceability: "desc", energy: "desc"},
		description: "Danceable {{type}} for getting your groove on",
	},
	{
		traits: {acousticness: "asc", valence: "asc"},
		description: "Mellow {{type}} for a laid-back evening",
	},
	{
		traits: {energy: "desc", valence: "desc"},
		description: "Rockin' {{type}} for a rock concert",
	},
	{
		traits: {danceability: "asc", valence: "asc"},
		description: "Smooth {{type}} for a romantic date",
	},
	{
		traits: {energy: "desc", danceability: "desc"},
		description: "Punchy {{type}} for a workout",
	},
	{
		traits: {instrumentalness: "asc", valence: "asc"},
		description: "Mystical {{type}} for a meditative mood",
	},
	{
		traits: {energy: "desc", danceability: "desc"},
		description: "Electrifying {{type}} for a dance party",
	},
	{
		traits: {instrumentalness: "asc", speechiness: "desc"},
		description: "Intriguing {{type}} for a thought-provoking playlist",
	},
	{
		traits: {energy: "desc", valence: "desc"},
		description: "Sassy {{type}} for a girls' night out",
	},
] as {
	traits: {[key in keyof typeof FEATURES]?: "asc" | "desc"}
	description: `${string}{{type}}${string}` | `{{Type}}${string}`
	ignore?: (keyof typeof FEATURES)[]
}[]