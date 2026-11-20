import type { Issue } from "./validate";

export const SCRIPT_TEXT_LIMITS = { maxWordsPerSentence: 12, maxNames: 2 } as const;

// The two limits on the page texts of a model script (#83, design.md "2.
// StoryRun Workflow", "Script rules"). Reports only: code never changes the
// text. The sentence split also splits after a closing quote, so it differs
// from the `PageTextSchema` split on purpose.
export function scriptTextIssues(pages: ReadonlyArray<{ text: string }>, cast: readonly string[]): Issue[] {
  const issues: Issue[] = [];
  const names: string[] = [];
  pages.forEach((page, i) => {
    const sentences = page.text
      .trim()
      .split(/(?<=[.!?]["'\u201D\u2019]?)\s+/)
      .filter((s) => s.length > 0);
    sentences.forEach((sentence, s) => {
      const words = sentence.trim().split(/\s+/);
      if (words.length > SCRIPT_TEXT_LIMITS.maxWordsPerSentence) {
        issues.push({
          path: `pages.${i}.text`,
          code: "sentence_too_long",
          message: `Sentence ${s + 1} has ${words.length} words; the limit is ${SCRIPT_TEXT_LIMITS.maxWordsPerSentence}.`,
        });
      }
      let run: string[] = [];
      const endRun = () => {
        const name = run.join(" ");
        if (run.length > 0 && !names.includes(name)) names.push(name);
        run = [];
      };
      words.forEach((raw, w) => {
        const core = raw
          .replace(/^[^A-Za-z0-9]+/, "")
          .replace(/[^A-Za-z0-9]+$/, "")
          .replace(/['\u2019]s$/, "");
        const isName =
          w > 0 &&
          !/^["'\u201C\u2018]/.test(raw) &&
          /^[A-Z]/.test(core) &&
          !cast.includes(core.toLowerCase()) &&
          !/^I(['\u2019]|$)/.test(core);
        if (!isName) return endRun();
        run.push(core);
        if (/[^A-Za-z0-9]$/.test(raw)) endRun();
      });
      endRun();
    });
  });
  if (names.length > SCRIPT_TEXT_LIMITS.maxNames) {
    issues.push({
      path: "pages",
      code: "too_many_names",
      message: `The page texts have ${names.length} real-world names; the limit is ${SCRIPT_TEXT_LIMITS.maxNames}: ${names.map((x) => `"${x}"`).join(", ")}.`,
    });
  }
  return issues;
}
