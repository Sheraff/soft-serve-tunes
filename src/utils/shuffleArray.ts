// Fisher-Yates shuffle algorithm

export default function shuffleArray<T>(array: T[]) {
	for (let i = array.length - 1; i > 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1))
		const temp = array[i]!
		array[i] = array[randomIndex]!
		array[randomIndex] = temp
	}
	return array
}