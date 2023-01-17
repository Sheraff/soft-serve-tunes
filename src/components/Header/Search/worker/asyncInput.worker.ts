import longestCommonSubstring from "./lcs"
import damLev from "./damLev"

type DistanceObject = {
	lcs: number
	levenshtein: number
	start: boolean
}

type NamedInterface = {
	name: string
	id: number
}

const memoizedInputDistances = new Map<string, Map<string, DistanceObject>>()

function getMemoized(input: string, candidate: string): DistanceObject | null {
	const inputDistances = memoizedInputDistances.get(input)
	if (inputDistances) {
		const candidateDistances = inputDistances.get(candidate)
		if (candidateDistances) {
			return candidateDistances
		}
	}
	return null
}

function setMemoized(input: string, candidate: string, object: DistanceObject) {
	let inputDistances = memoizedInputDistances.get(input)
	if (!inputDistances) {
		inputDistances = new Map()
		memoizedInputDistances.set(input, inputDistances)
	}
	inputDistances.set(candidate, object)
}

function cleanupString(str: string) {
	return str.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

function classify(_input: string, _candidate: string): DistanceObject {
	const input = cleanupString(_input)
	const candidate = cleanupString(_candidate)
	const { length: inputMax } = input
	const { length: candidateMax } = candidate
	const maxLength = Math.max(inputMax, candidateMax)
	const lcsDistanceNormalized = (inputMax - longestCommonSubstring(input, candidate).length) / inputMax
	const levenshteinDistanceNormalized = damLev(input, candidate) / maxLength
	const start = candidate.startsWith(input)
	return {
		lcs: lcsDistanceNormalized,
		levenshtein: levenshteinDistanceNormalized,
		start
	}
}

function getDistances(input: string, candidate: string): DistanceObject {
	const memoized = getMemoized(input, candidate)
	if (memoized) {
		return memoized
	}
	const computed = classify(input, candidate)
	setMemoized(input, candidate, computed)
	return computed
}

let dataList: NamedInterface[] = []

function handleList({ list }: { list: NamedInterface[] }) {
	dataList = list
}

function handleInput({ input }: { input: string }) {
	const list = dataList.sort((aItem, bItem) => {
		const aName = aItem.name
		const bName = bItem.name
		const a = getDistances(input, aName)
		const b = getDistances(input, bName)
		if (a.lcs !== b.lcs) {
			return a.lcs - b.lcs
		}
		if (a.start !== b.start) {
			return a.start ? -1 : 1
		}
		return a.levenshtein - b.levenshtein
	})

	const res = new Uint16Array(list.slice(0, 50).map(({ id }) => id))
	postMessage({ input, list: res }, { transfer: [res.buffer] })
}

onmessage = function ({ data }: {
	data:
	| { type: "list"; list: NamedInterface[] }
	| { type: "input"; input: string }
	| { type: "never"; }
}) {
	switch (data.type) {
		case "list":
			handleList(data)
			break
		case "input":
			handleInput(data)
			break
		default:
			throw new Error(
				`unknown message type ${data.type} in useAsyncInputStringDistance worker`
			)
	}
}