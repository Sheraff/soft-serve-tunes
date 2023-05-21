/// <reference lib="webworker" />

import longestCommonSubstring from "./lcs"
import damLev from "./damLev"

type NamedInterface = {
	name: string
	id: number
}

function cleanupString(str: string) {
	return str.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

let dataList: NamedInterface[] = []
let requestedSize = 50

function handleList({ list, size }: { list: NamedInterface[], size: number }) {
	dataList = list
	requestedSize = size
}

type DistObj = {
	id: number
	cleaned: string
	lcs?: number
	levenshtein?: number
	start?: boolean
	equal?: boolean
}

function getEqual(cleanInput: string, memo: DistObj): boolean {
	if (memo.equal !== undefined) return memo.equal
	const equal = cleanInput === memo.cleaned
	memo.equal = equal
	return equal
}

function getLcs(cleanInput: string, memo: DistObj): number {
	if (memo.lcs !== undefined) return memo.lcs
	const rawLcs = longestCommonSubstring(cleanInput, memo.cleaned).length
	const inputMax = cleanInput.length
	const lcsDistanceNormalized = (inputMax - rawLcs) / inputMax
	memo.lcs = lcsDistanceNormalized
	return lcsDistanceNormalized
}

function getStart(cleanInput: string, memo: DistObj): boolean {
	if (memo.start !== undefined) return memo.start
	const start = memo.cleaned.startsWith(cleanInput)
	memo.start = start
	return start
}

function getLevenshtein(cleanInput: string, memo: DistObj): number {
	if (memo.levenshtein !== undefined) return memo.levenshtein
	const inputMax = cleanInput.length
	const maxLength = Math.max(inputMax, memo.cleaned.length)
	const levenshteinDistanceNormalized = damLev(cleanInput, memo.cleaned) / maxLength
	memo.levenshtein = levenshteinDistanceNormalized
	return levenshteinDistanceNormalized
}

let latestInput: string
async function handleInput({ input }: { input: string }) {
	latestInput = input
	await new Promise(resolve => setTimeout(resolve, 0))
	if (latestInput !== input) return
	const cleanInput = cleanupString(input)
	const empty = undefined
	const list = dataList
		.map(item => ({
			id: item.id,
			cleaned: cleanupString(item.name),
			lcs: empty,
			levenshtein: empty,
			start: empty,
			equal: empty,
		}) as DistObj)
		.sort((aMemo, bMemo) => {
			const aEqual = getEqual(cleanInput, aMemo)
			const bEqual = getEqual(cleanInput, bMemo)
			if (aEqual && !bEqual) {
				return -1
			}
			if (!aEqual && bEqual) {
				return 1
			}
			if (aEqual && bEqual) {
				return 0
			}

			const aLcs = getLcs(cleanInput, aMemo)
			const bLcs = getLcs(cleanInput, bMemo)
			if (aLcs !== bLcs) {
				return aLcs - bLcs
			}

			const aStart = getStart(cleanInput, aMemo)
			const bStart = getStart(cleanInput, bMemo)
			if (aStart !== bStart) {
				return aStart ? -1 : 1
			}

			const aLevenshtein = getLevenshtein(cleanInput, aMemo)
			const bLevenshtein = getLevenshtein(cleanInput, bMemo)
			return aLevenshtein - bLevenshtein
		})

	await new Promise(resolve => setTimeout(resolve, 0))
	if (latestInput !== input) return
	const max = Math.min(list.length, requestedSize)
	const res = new Uint16Array(max)
	for (let i = 0; i < max; i++) {
		res[i] = list[i]!.id
	}
	postMessage({ input, list: res }, { transfer: [res.buffer] })
}

onmessage = function ({ data }: {
	data:
	| { type: "list"; list: NamedInterface[]; size: number }
	| { type: "input"; input: string }
	| { type: "never" }
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