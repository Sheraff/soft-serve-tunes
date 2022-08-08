// DAMEREAU-LEVENSHTEIN
// https://github.com/microsoft/damlev#readme
// Cache the codes and score arrays to significantly speed up damlev calls:
// there's no need to re-allocate them.
let sourceCodes;
let targetCodes;
let score;

/**
 * Clears the cached arrays, freeing memory that would otherwise be kept
 * forever.
 */
function uncacheDamLev() {
  sourceCodes = new Array(32);
  targetCodes = new Array(32);
  score = new Array(33 * 33);
}

uncacheDamLev();

/**
 * growArrayDamLev will return an array that's at least as large as the provided
 * size. It may or may not return the same array that was passed in.
 * @param  {number[]} arr
 * @param  {number} size
 * @return {number[]}
 */
function growArrayDamLev(arr, size) {
  if (size <= arr.length) {
    return arr;
  }

  let target = arr.length;
  while (target < size) {
    target *= 2;
  }

  return new Array(target);
}

/**
 * Returns the edit distance between the source and target strings.
 * @param  {string} source
 * @param  {string} target
 * @return {number}
 */
export default function damLev(source, target) {
  // If one of the strings is blank, returns the length of the other (the
  // cost of the n insertions)
  if (!source) {
    return target.length;
  }
  if (!target) {
    return source.length;
  }

  const sourceLength = source.length;
  const targetLength = target.length;
  let i;

  // Initialize a char code cache array
  sourceCodes = growArrayDamLev(sourceCodes, sourceLength);
  targetCodes = growArrayDamLev(targetCodes, targetLength);
  for (i = 0; i < sourceLength; i++) {
    sourceCodes[i] = source.charCodeAt(i);
  }
  for (i = 0; i < targetLength; i++) {
    targetCodes[i] = target.charCodeAt(i);
  }

  // Initialize the scoring matrix
  const INF = sourceLength + targetLength;
  const rowSize = sourceLength + 1;
  score = growArrayDamLev(score, (sourceLength + 1) * (targetLength + 1));
  score[0] = INF;

  for (i = 0; i <= sourceLength; i++) {
    score[(i + 1) * rowSize] = INF;
    score[(i + 1) * rowSize + 1] = i;
  }

  for (i = 0; i <= targetLength; i++) {
    score[i] = INF;
    score[1 * rowSize + i + 1] = i;
  }

  // Run the damlev algorithm
  const chars = {};
  let j;
  let DB;
  let i1;
  let j1;
  let newScore;
  for (i = 1; i <= sourceLength; i += 1) {
    DB = 0;
    for (j = 1; j <= targetLength; j += 1) {
      i1 = chars[targetCodes[j - 1]] || 0;
      j1 = DB;

      if (sourceCodes[i - 1] === targetCodes[j - 1]) {
        newScore = score[i * rowSize + j];
        DB = j;
      } else {
        newScore =
          Math.min(
            score[i * rowSize + j],
            Math.min(score[(i + 1) * rowSize + j], score[i * rowSize + j + 1])
          ) + 1;
      }

      score[(i + 1) * rowSize + j + 1] = Math.min(
        newScore,
        score[i1 * rowSize + j1] + (i - i1) + (j - j1 - 1)
      );
    }
    chars[sourceCodes[i - 1]] = i;
  }
  return score[(sourceLength + 1) * rowSize + targetLength + 1];
}