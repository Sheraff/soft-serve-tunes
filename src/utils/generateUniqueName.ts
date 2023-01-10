export default function generateUniqueName(name: string, list: {name: string}[]) {
	const existingNumberRegex = /\s#([0-9]+)$/
	const match = name.match(existingNumberRegex)
	let appendCount = match ? Number(match[1]) : 1
	const baseName = match ? name.replace(existingNumberRegex, "") : name
	let uniqueName: string
	do {
		uniqueName = appendCount > 1 ? `${baseName} #${appendCount}` : baseName
		appendCount += 1
	} while (list.some(({name}) => name === uniqueName))
	return uniqueName
}