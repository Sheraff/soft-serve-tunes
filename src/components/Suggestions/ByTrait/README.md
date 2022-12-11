https://developer.spotify.com/documentation/web-api/reference/#/operations/get-audio-features

acousticness
A confidence measure from 0.0 to 1.0 of whether the track is acoustic. 1.0 represents high confidence the track is acoustic.

danceability
Danceability describes how suitable a track is for dancing based on a combination of musical elements including tempo, rhythm stability, beat strength, and overall regularity. A value of 0.0 is least danceable and 1.0 is most danceable.

energy
Energy is a measure from 0.0 to 1.0 and represents a perceptual measure of intensity and activity. Typically, energetic tracks feel fast, loud, and noisy. For example, death metal has high energy, while a Bach prelude scores low on the scale. Perceptual features contributing to this attribute include dynamic range, perceived loudness, timbre, onset rate, and general entropy.

instrumentalness
Predicts whether a track contains no vocals. "Ooh" and "aah" sounds are treated as instrumental in this context. Rap or spoken word tracks are clearly "vocal". The closer the instrumentalness value is to 1.0, the greater likelihood the track contains no vocal content. Values above 0.5 are intended to represent instrumental tracks, but confidence is higher as the value approaches 1.0.

liveness
Detects the presence of an audience in the recording. Higher liveness values represent an increased probability that the track was performed live. A value above 0.8 provides strong likelihood that the track is live.

loudness
The overall loudness of a track in decibels (dB). Loudness values are averaged across the entire track and are useful for comparing relative loudness of tracks. Loudness is the quality of a sound that is the primary psychological correlate of physical strength (amplitude). Values typically range between -60 and 0 db.

mode
Mode indicates the modality (major or minor) of a track, the type of scale from which its melodic content is derived. Major is represented by 1 and minor is 0.

speechiness
Speechiness detects the presence of spoken words in a track. The more exclusively speech-like the recording (e.g. talk show, audio book, poetry), the closer to 1.0 the attribute value. Values above 0.66 describe tracks that are probably made entirely of spoken words. Values between 0.33 and 0.66 describe tracks that may contain both music and speech, either in sections or layered, including such cases as rap music. Values below 0.33 most likely represent music and other non-speech-like tracks.

tempo
The overall estimated tempo of a track in beats per minute (BPM). In musical terminology, tempo is the speed or pace of a given piece and derives directly from the average beat duration.

valence
A measure from 0.0 to 1.0 describing the musical positiveness conveyed by a track. Tracks with high valence sound more positive (e.g. happy, cheerful, euphoric), while tracks with low valence sound more negative (e.g. sad, depressed, angry).


chatGPT:

template prompt (after having given it the list of all scales above):

> give me adjectives that would qualify a song high on the danceability scale, but would not describe its position on any of the other scales (acousticness, energy, instrumentalness, liveness, speechiness, valence).

high-danceability

foot-tapping, body-moving, and irresistible.
the song has a strong, infectious beat and rhythm that are likely to get people up and dancing,
infectious, irresistible, and exhilarating.

low-danceability

sluggish, heavy, and uninspired
the song lacks the energy and rhythm necessary to get people moving and dancing
lackadaisical, listless, and dull.

high-acousticness

natural, stripped-down, and unplugged
the song is performed using primarily acoustic instruments and has a raw, natural sound
organic, folksy, and acoustic.

low-acousticness

synthetic, processed, and electronic
the song is heavily produced and uses electronic instruments and effects
artificial, digital, and electronic.

high-instrumentalness

instrumental, free-form, and nonverbal
the song is performed without vocals and relies primarily on instrumental sounds and compositions
abstract, atmospheric, and ambient.

low-instrumentalness

vocal, lyrical, and sung
the song is performed with vocals and features lyrics
sung, verbal, and lyrical.

high-speechiness

verbal, spoken, and talkative
the song is primarily composed of spoken words and does not contain much musical content
conversational, chatty, and talky.

low-speechiness

musical, instrumental, and tuneful
the song is primarily composed of musical sounds and does not contain much spoken content
melodic, harmonic, and tonal.

high-energy

energetic, lively, and vibrant
the song has a high level of intensity and activity
exhilarating, lively, and dynamic.

low-energy

calm, peaceful, and relaxed
the song has a low level of intensity and activity
tranquil, serene, and mellow.

high-valence

cheerful, happy, and upbeat
the song conveys a sense of positivity and joy
joyful, euphoric, and exuberant.

low-valence

include sad, melancholy, and somber
the song conveys a sense of negativity and sadness
despondent, morose, and bleak.






how about adjectives for a high-instrumentalness high-speechiness song

experimental, avant-garde, and nonlinear
the song is unconventional and does not follow traditional musical structures or conventions
avant-garde, unorthodox, and unconventional.

how about adjectives for a low-instrumentalness low-speechiness song

traditional, classic, and straightforward
the song follows familiar musical structures and conventions and does not include much in the way of unconventional or experimental elements
conventional, predictable, and formulaic.