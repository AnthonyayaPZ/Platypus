export type WordSuggestion = {
  word: string;
  match: "prefix" | "fuzzy";
  distance: number;
};

const WORD_LIST_URL = "/wordlists/common-english.txt";
const WORD_PATTERN = /^[a-z]+$/;
let wordsPromise: Promise<string[]> | null = null;

export function parseWordList(source: string) {
  const seen = new Set<string>();
  return source
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => {
      if (!WORD_PATTERN.test(word) || seen.has(word)) return false;
      seen.add(word);
      return true;
    });
}

export async function loadCommonWords() {
  if (!wordsPromise) {
    wordsPromise = fetch(WORD_LIST_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("常用词表加载失败");
        return response.text();
      })
      .then(parseWordList)
      .catch((error) => {
        wordsPromise = null;
        throw error;
      });
  }
  return wordsPromise;
}

function distanceFromTypedPrefix(query: string, word: string, maximum: number) {
  const candidate = word.slice(0, query.length + maximum);
  const matrix = Array.from({ length: query.length + 1 }, () =>
    Array<number>(candidate.length + 1).fill(0),
  );
  for (let row = 0; row <= query.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= candidate.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= query.length; row += 1) {
    for (let column = 1; column <= candidate.length; column += 1) {
      const substitutionCost = query[row - 1] === candidate[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
      if (
        row > 1
        && column > 1
        && query[row - 1] === candidate[column - 2]
        && query[row - 2] === candidate[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }

  const shortest = Math.max(1, query.length - maximum);
  const longest = candidate.length;
  let best = Number.POSITIVE_INFINITY;
  for (let length = shortest; length <= longest; length += 1) {
    best = Math.min(best, matrix[query.length][length]);
  }
  return best <= maximum ? best : null;
}

export function suggestWords(words: string[], rawQuery: string, limit = 8): WordSuggestion[] {
  const query = rawQuery.trim().toLowerCase();
  if (!WORD_PATTERN.test(query)) return [];
  const safeLimit = Math.min(12, Math.max(1, Math.trunc(limit)));
  const prefixMatches: WordSuggestion[] = [];

  for (const word of words) {
    if (word.startsWith(query)) {
      prefixMatches.push({ word, match: "prefix", distance: 0 });
      if (prefixMatches.length === safeLimit) return prefixMatches;
    }
  }

  if (prefixMatches.length > 0 || query.length < 3) return prefixMatches;
  const maximumDistance = query.length >= 6 ? 2 : 1;
  const fuzzyMatches: Array<WordSuggestion & { frequencyRank: number }> = [];

  words.forEach((word, frequencyRank) => {
    if (word.length < query.length - maximumDistance) return;
    const distance = distanceFromTypedPrefix(query, word, maximumDistance);
    if (distance !== null && distance > 0) {
      fuzzyMatches.push({ word, match: "fuzzy", distance, frequencyRank });
    }
  });

  fuzzyMatches.sort((left, right) =>
    left.distance - right.distance
    || left.frequencyRank - right.frequencyRank
    || left.word.length - right.word.length,
  );

  return [
    ...prefixMatches,
    ...fuzzyMatches.slice(0, safeLimit - prefixMatches.length),
  ].map(({ word, match, distance }) => ({ word, match, distance }));
}

export async function getWordSuggestions(query: string, limit = 8) {
  return suggestWords(await loadCommonWords(), query, limit);
}
