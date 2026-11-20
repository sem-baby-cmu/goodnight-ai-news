import { describe, expect, it } from "vitest";
import { scriptTextIssues } from "./script-text";

const cast = ["pip", "lumi"];

describe("scriptTextIssues", () => {
  it("RUN-01.S13 a script sentence of more than 12 words fails script validation", () => {
    expect(scriptTextIssues([{ text: "Pip and Lumi walk up the hill to see the big tree." }], cast)).toEqual([]);
    expect(
      scriptTextIssues([{ text: "Pip waves." }, { text: "Pip and Lumi walk up the hill to see the big old tree." }], cast),
    ).toEqual([{ path: "pages.1.text", code: "sentence_too_long", message: "Sentence 1 has 13 words; the limit is 12." }]);
  });

  it("RUN-01.S14 a script with more than 2 real-world names fails script validation", () => {
    expect(scriptTextIssues([{ text: "Pip visits Paris. Lumi visits Rome. Pip visits Paris again." }], cast)).toEqual([]);
    expect(scriptTextIssues([{ text: "Pip visits Paris." }, { text: "Lumi visits Rome and Oslo." }], cast)).toEqual([
      {
        path: "pages",
        code: "too_many_names",
        message: 'The page texts have 3 real-world names; the limit is 2: "Paris", "Rome", "Oslo".',
      },
    ]);
  });

  it("script names: a run of capitalised words is one name, and a comma ends a name", () => {
    const issues = scriptTextIssues(
      [{ text: "On Monday, Pip went to New York City." }, { text: "Pip and I went to Paris with Grandma Rose." }],
      cast,
    );
    expect(issues).toEqual([
      {
        path: "pages",
        code: "too_many_names",
        message: 'The page texts have 4 real-world names; the limit is 2: "Monday", "New York City", "Paris", "Grandma Rose".',
      },
    ]);
  });

  it("script names: a cast key, a sentence start, an opening quote, and I are not names", () => {
    for (const text of [
      "I'm Pip! I'll see Lumi's kite.",
      'Pip waves. "We see you," said Lumi, "We are here!"',
      '"We did it!" The friends cheered.',
      "Pip sees \u201CHello!\u201D The sun is up.",
    ]) {
      expect(scriptTextIssues([{ text }], cast), text).toEqual([]);
    }
  });

  it("script sentences: a closing quote ends a sentence", () => {
    expect(scriptTextIssues([{ text: '"We did it!" Pip and Lumi ran up the hill to the old oak tree.' }], cast)).toEqual([]);
  });
});
