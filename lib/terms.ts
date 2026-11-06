/** Spaces belong to a phrase, never a batch of words. */
export function normalizeDictionaryTerm(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const term = value.trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  const words = term.split(" ");
  if (!term || words.length > 8 || term.length > (words.length === 1 ? 48 : 96)
    || words.some((word) => !/^[a-z]+(?:['-][a-z]+)*$/.test(word))) return null;
  return term;
}

export const isPhrase = (term: string) => term.includes(" ");
export const phraseGroupId = (userId: string) => `system-phrases-${userId}`;

export function defaultSearchGroup<T extends { id: string; kind?: string; is_default?: number }>(groups: T[], term: string, current = "") {
  if (isPhrase(term)) return groups.find((group) => group.kind === "phrases")?.id ?? "";
  return groups.find((group) => group.id === current && group.kind !== "phrases")?.id
    ?? groups.find((group) => group.is_default && group.kind !== "phrases")?.id
    ?? groups.find((group) => group.kind !== "phrases")?.id ?? "";
}
