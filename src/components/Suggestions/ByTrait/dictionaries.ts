
export const FEATURES = {
	danceability: {
		"0": {
			qualifier: "hectic",
			listOrder: 2,
		},
		"1": {
			qualifier: "rhythmic",
			listOrder: 5,
		},
	},
	energy: {
		"0": {
			qualifier: "mellow",
			listOrder: 2,
		},
		"1": {
			qualifier: "energetic",
			listOrder: 2,
		},
	},
	acousticness: {
		"0": {
			qualifier: "electric",
			listOrder: 2,
		},
		"1": {
			qualifier: "acoustic",
			listOrder: 2,
		},
	},
	instrumentalness: {
		"0": {
			qualifier: "minimal",
			listOrder: 2,
		},
		"0.5": {
			qualifier: "musical",
			listOrder: 2,
		},
		"1": {
			qualifier: "instrumental",
			listOrder: 2,
		},
	},
	liveness: {
		"0": {
			qualifier: "studio",
			listOrder: 3,
		},
		"1": {
			qualifier: "live",
			listOrder: 1,
		},
	},
	valence: {
		"0": {
			qualifier: "somber",
			listOrder: 2,
		},
		"1": {
			qualifier: "upbeat",
			listOrder: 2,
		},
	},
	speechiness: {
		"0": {
			qualifier: "melodic",
			listOrder: 2,
		},
		"0.3": {
			qualifier: "song",
			listOrder: 4,
		},
		"0.6": {
			qualifier: "rap",
			listOrder: 4,
		},
		"1": {
			qualifier: "prose",
			listOrder: 4,
		},
	},
}

export const COMBINED_FEATURES = [
	{
		traits: {danceability: "0"},
		description: "Lackadaisical {{type}}",
	},
	{
		traits: {danceability: "1"},
		description: "{{Type}} with infectious beats",
	},
	{
		traits: {energy: "0"},
		description: "{{Type}} to relax to",
	},
	{
		traits: {energy: "1"},
		description: "High-octane {{type}}",
	},
	{
		traits: {acousticness: "0"},
		description: "Electric {{type}}",
	},
	{
		traits: {acousticness: "1"},
		description: "Acoustic {{type}}",
	},
	{
		traits: {instrumentalness: "0"},
		description: "Minimalist {{type}}",
	},
	{
		traits: {instrumentalness: "0.5"},
		description: "Musical {{type}}",
	},
	{
		traits: {instrumentalness: "1"},
		description: "Atmospheric {{type}}",
	},
	{
		traits: {liveness: "0"},
		description: "{{Type}} recorded in a studio",
	},
	{
		traits: {liveness: "1"},
		description: "{{Type}} performed live",
	},
	{
		traits: {valence: "0"},
		description: "Melancholic {{type}}",
	},
	{
		traits: {valence: "1"},
		description: "Cheerful {{type}}",
	},
	{
		traits: {speechiness: "0"},
		description: "Melodic {{type}}",
	},
	{
		traits: {speechiness: "0.3"},
		description: "Mid speech {{type}}",
	},
	{
		traits: {speechiness: "0.7"},
		description: "Mid speech {{type}}",
	},
	{
		traits: {speechiness: "1"},
		description: "{{Type}} with the best flow",
	},
	{
		traits: {danceability: "1", energy: "1"},
		description: "{{Type}} for clubbing",
	},
	{
		traits: {acousticness: "0", energy: "1"},
		description: "{{Type}} for headbanging",
	},
	{
		traits: {danceability: "1", energy: "1", acousticness: "0"},
		description: "{{Type}} for a rave",
	},
	{
		traits: {danceability: "1", speechiness: "1"},
		description: "Grooviest prose",
	},
	// {
	// 	traits: {energy: "0",speechiness: "1"},
	// 	description: "Smooth songs",
	// },
	// {
	// 	traits: {speechiness: "0", instrumentalness: "0", danceability: "1"},
	// 	description: "{{Type}} for karaoke",
	// },
	{
		traits: {instrumentalness: "0", danceability: "1", energy: "1", valence: "1"},
		description: "{{Type}} for a party",
	},
	{
		traits: {energy: "1", acousticness: "0", valence: "1"},
		ignore: ["danceability", "liveness"],
		description: "High-energy {{danceability}} {{liveness}} {{type}}",
	},
	{
		traits: {energy: "1", acousticness: "0", valence: "0"},
		ignore: ["danceability", "liveness"],
		description: "{{Danceability}} emo {{liveness}} {{type}}",
	},
	{
		traits: {energy: "0", acousticness: "1", valence: "0"},
		ignore: ["danceability", "liveness", "instrumentalness", "speechiness"],
		description: "{{Danceability}} {{speechiness}} {{instrumentalness}} {{liveness}} ballads",
	},
	// chatGPT generated
	{
		traits: {energy: "1", valence: "1", acousticness: "0"},
		description: "Energetic {{type}} for getting pumped up",
	},
	{
		traits: {energy: "0", acousticness: "1", valence: "0", instrumentalness: "1"},
		description: "Soothing {{type}} for relaxation",
	},
	{
		traits: {energy: "1", danceability: "1", valence: "1", speechiness: "0"},
		description: "Upbeat {{type}} for a road trip",
	},
	{
		traits: {energy: "0", acousticness: "1", valence: "0", instrumentalness: "0"},
		description: "Introspective {{type}} for a rainy day",
	},
	{
		traits: {energy: "1", danceability: "1", valence: "1", liveness: "1"},
		description: "Fiery {{type}} for a dance-off",
	},
	{
		traits: {energy: "0", acousticness: "0", valence: "1", instrumentalness: "0"},
		description: "Chill {{type}} for a beach bonfire",
	},
	{
		traits: {energy: "1", acousticness: "0", valence: "1", speechiness: "0"},
		description: "Melodic {{type}} for a sing-along",
	},
	{
		traits: {danceability: "1", energy: "1", valence: "1", speechiness: "0"},
		description: "Funkalicious {{type}} for a funky good time",
	},
	{
		traits: {danceability: "1", energy: "1", valence: "1", acousticness: "0", instrumentalness: "0"},
		description: "Old-school {{type}} for a throwback party",
	},
	{
		traits: {energy: "0", acousticness: "0", valence: "0", instrumentalness: "1", speechiness: "0"},
		description: "Dreamy {{type}} for a dreamy vibe",
	},
	{
		traits: {danceability: "1", energy: "1"},
		description: "Danceable {{type}} for getting your groove on",
	},
	{
		traits: {acousticness: "0", valence: "0"},
		description: "Mellow {{type}} for a laid-back evening",
	},
	{
		traits: {energy: "1", valence: "1"},
		description: "Rockin' {{type}} for a rock concert",
	},
	{
		traits: {danceability: "0", valence: "0"},
		description: "Smooth {{type}} for a romantic date",
	},
	{
		traits: {energy: "1", danceability: "1"},
		description: "Punchy {{type}} for a workout",
	},
	{
		traits: {instrumentalness: "0", valence: "0"},
		description: "Mystical {{type}} for a meditative mood",
	},
	{
		traits: {energy: "1", danceability: "1"},
		description: "Electrifying {{type}} for a dance party",
	},
	{
		traits: {instrumentalness: "0", speechiness: "1"},
		description: "Intriguing {{type}} for a thought-provoking playlist",
	},
	{
		traits: {energy: "1", valence: "1"},
		description: "Sassy {{type}} for a girls' night out",
	},
] as {
	traits: {[key in keyof typeof FEATURES]?: keyof typeof FEATURES[key]}
	description: string,
	ignore?: (keyof typeof FEATURES)[]
}[]