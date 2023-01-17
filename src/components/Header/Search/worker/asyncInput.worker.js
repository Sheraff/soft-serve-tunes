// @ts-check

import longestCommonSubstring from "./lcs.js"
import damLev from "./damLev.js"

/**
 * @typedef {{
 * 	lcs: number
 * 	levenshtein: number
 * 	start: boolean
 * }} DistanceObject
 */

/**
 * @typedef {{
 *  name: string
 *  id: number
 * }} NamedInterface
 */

/** @type {Map<string, Map<string, DistanceObject>>} */
const memoizedInputDistances = new Map()

/**
 * @param {string} input
 * @param {string} candidate
 * @returns {DistanceObject | null}
 */
function getMemoized(input, candidate) {
  const inputDistances = memoizedInputDistances.get(input)
  if (inputDistances) {
    const candidateDistances = inputDistances.get(candidate)
    if (candidateDistances) {
      return candidateDistances
    }
  }
  return null
}

/**
 * @param {string} input
 * @param {string} candidate
 * @param {DistanceObject} object
 */
function setMemoized(input, candidate, object) {
  let inputDistances = memoizedInputDistances.get(input)
  if (!inputDistances) {
    inputDistances = new Map()
    memoizedInputDistances.set(input, inputDistances)
  }
  inputDistances.set(candidate, object)
}

/**
 * @param {string} str 
 */
function cleanupString(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

/**
 * @param {string} _input
 * @param {string} _candidate
 * @returns {DistanceObject}
 */
function classify(_input, _candidate) {
  const input = cleanupString(_input)
  const candidate = cleanupString(_candidate)
  const { length: inputMax } = input
  const { length: candidateMax } = candidate
  const maxLength = Math.max(inputMax, candidateMax)
  const lcsDistanceNormalized =
    (inputMax - longestCommonSubstring(input, candidate).length) / inputMax
  const levenshteinDistanceNormalized = damLev(input, candidate) / maxLength
  const start = candidate.startsWith(input)
  return {
    lcs: lcsDistanceNormalized,
    levenshtein: levenshteinDistanceNormalized,
    start
  }
}

/**
 * @param {string} input
 * @param {string} candidate
 * @returns {DistanceObject}
 */
function getDistances(input, candidate) {
  const memoized = getMemoized(input, candidate)
  if (memoized) {
    return memoized
  }
  const computed = classify(input, candidate)
  setMemoized(input, candidate, computed)
  return computed
}

/** @type {NamedInterface[]} */
let dataList = []

/**
 * @param {Object} param
 * @param {NamedInterface[]} param.list
 */
function handleList({ list }) {
  dataList = list
}

/**
 * @param {Object} param
 * @param {string} param.input
 */
function handleInput({ input }) {
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

  const res = new Uint16Array(list.slice(0, 50).map(({id}) => id))
  postMessage({ input, list: res }, {transfer: [res.buffer]})
}

onmessage = function ({ data }) {
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