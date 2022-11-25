export default function generateUniqueName(name: string, list: {name: string}[]) {
	let appendCount = 1
	let uniqueName: string
	do {
		uniqueName = appendCount > 1 ? `${name} #${appendCount}` : name
		appendCount += 1
	} while (list.some(({name}) => name === uniqueName))
	return uniqueName
}