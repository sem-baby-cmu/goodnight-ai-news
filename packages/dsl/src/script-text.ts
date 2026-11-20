import type { Issue } from "./validate";

export const SCRIPT_TEXT_LIMITS = { maxWordsPerSentence: 12, maxNames: 2 } as const;

// RED stub for #83: the counting rule is not implemented yet.
export function scriptTextIssues(pages: ReadonlyArray<{ text: string }>, cast: readonly string[]): Issue[] {
  void pages;
  void cast;
  return [];
}
