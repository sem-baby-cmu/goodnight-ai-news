import { expect, it } from "vitest";
import css from "./styles.css?raw";
import main from "./main.tsx?raw";

// Copied from DESIGN.md section 2: Palette (18), Supporting values (7),
// Studio states (17). Names and values are lower case, with spaces removed.
// The name of a state variable is the prefix of the table plus a suffix:
// the prefix alone is the fill, `-chip` is the chip text, `-notice` is the
// notice text, `-edge` is the notice button edge. A cell that says "none" or
// "not used" has no variable.
const designTokens: Record<string, string> = {
  // Palette
  desk: "#f6ebda",
  paper: "#fff8ec",
  card: "#fffdf8",
  cream: "#efe4d0",
  ink: "#3a2e25",
  "ink-2": "#5e4e42",
  "ink-3": "#7a6656",
  "teal-deep": "#137a70",
  "teal-edge": "#0c5850",
  "teal-text": "#0f665e",
  teal: "#21a193",
  cobalt: "#2350c8",
  sun: "#e2ae4a",
  moon: "#f4d98a",
  coral: "#c9694f",
  wood: "#b8774a",
  "wood-light": "#d29a68",
  "wood-deep": "#8e5533",
  // Supporting values
  edge: "#e6d5bc",
  soft: "#f3e8d5",
  "soft-edge": "#e2d2b6",
  "seg-edge": "#dcc9aa",
  "field-border": "#eadbc2",
  "disabled-edge": "#e0d0b4",
  "dot-ahead": "#e6d9c4",
  // Studio states
  ok: "#ddf1ec",
  "ok-chip": "#0f665e",
  "ok-notice": "#0f665e",
  work: "#e3e9fa",
  "work-chip": "#2350c8",
  "work-notice": "#1e3f9e",
  "work-edge": "#c6d2f2",
  warn: "#fbefd2",
  "warn-chip": "#7a5410",
  "warn-notice": "#5e400c",
  "warn-edge": "#ebd6a6",
  bad: "#f8e2d9",
  "bad-chip": "#9a4630",
  "bad-notice": "#6e3322",
  "bad-edge": "#ebc3b4",
  none: "#efe4d0",
  "none-chip": "#5e4e42",
};

// Copied from DESIGN.md section 2, "shadcn names". `--card` is a palette
// variable above, so it is not listed here.
const shadcnTokens: Record<string, string> = {
  background: "var(--desk)",
  foreground: "var(--ink)",
  "card-foreground": "var(--ink)",
  popover: "var(--card)",
  "popover-foreground": "var(--ink)",
  primary: "var(--teal-deep)",
  "primary-foreground": "var(--card)",
  secondary: "var(--soft)",
  "secondary-foreground": "var(--teal-text)",
  muted: "var(--cream)",
  "muted-foreground": "var(--ink-2)",
  accent: "#ddf1ec",
  "accent-foreground": "var(--teal-text)",
  border: "var(--cream)",
  input: "var(--field-border)",
  ring: "var(--ink)",
  destructive: "#9a4630",
};

// The old palette is replaced. None of these names stays in `:root`.
const removedTokens = [
  "sky",
  "meadow",
  "forest",
  "night",
  "lamp",
  "roof-red",
  "paper-edge",
  "divider",
  "text",
  "text-2",
  "label",
  "link",
  "forest-edge",
  "highlight",
  "moss-text",
  "tint-sky",
  "tint-meadow",
  "tint-sand",
  "tint-sky-foreground",
  "tint-meadow-foreground",
  "tint-sand-foreground",
  "night-card",
  "night-label",
  "night-title",
  "radius",
];

// The palette and supporting names that Tailwind reads as `--color-<name>`.
// The Studio state variables are not mapped: `--color-none` would make
// `bg-none` emit a `background-color` rule. `card` is a shadcn line.
const themeColorNames = [
  "card",
  "desk",
  "paper",
  "cream",
  "ink",
  "ink-2",
  "ink-3",
  "teal-deep",
  "teal-edge",
  "teal-text",
  "teal",
  "cobalt",
  "sun",
  "moon",
  "coral",
  "wood",
  "wood-light",
  "wood-deep",
  "edge",
  "soft",
  "soft-edge",
  "seg-edge",
  "field-border",
  "disabled-edge",
  "dot-ahead",
];

// Every `--<name>: <value>;` inside `block`, normalised like the tables.
function declarations(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set((match[1] ?? "").toLowerCase(), (match[2] ?? "").replace(/\s+/g, "").toLowerCase());
  }
  return tokens;
}

// The `:root` block.
function rootTokens(text: string): Map<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(text);
  if (!block) throw new Error("styles.css has no :root block");
  return declarations(block[1] ?? "");
}

// The `@theme inline` block.
function themeTokens(text: string): Map<string, string> {
  const block = /@theme\s+inline\s*\{([^}]*)\}/.exec(text);
  if (!block) throw new Error("styles.css has no @theme inline block");
  return declarations(block[1] ?? "");
}

it("every DESIGN.md token has its value in :root", () => {
  expect(Object.keys(designTokens)).toHaveLength(42);
  const tokens = rootTokens(css);
  for (const [name, value] of Object.entries(designTokens)) {
    expect(tokens.get(name), `--${name}`).toBe(value);
  }
});

it("every shadcn name has its DESIGN.md value in :root", () => {
  expect(Object.keys(shadcnTokens)).toHaveLength(17);
  const tokens = rootTokens(css);
  for (const [name, value] of Object.entries(shadcnTokens)) {
    expect(tokens.get(name), `--${name}`).toBe(value);
  }
});

it("the old palette and the radius token are gone from :root", () => {
  expect(removedTokens).toHaveLength(25);
  const tokens = rootTokens(css);
  for (const name of removedTokens) {
    expect(tokens.has(name), `--${name}`).toBe(false);
  }
});

it("@theme sets one family, Baloo 2", () => {
  const theme = themeTokens(css);
  expect(theme.get("font-sans")).toBe('"baloo2",ui-rounded,system-ui,sans-serif');
  for (const name of ["font-display", "font-heading"]) {
    expect(theme.has(name), `--${name}`).toBe(false);
  }
});

it("@theme has no radius scale", () => {
  const theme = themeTokens(css);
  for (const name of ["radius-lg", "radius-xl"]) {
    expect(theme.has(name), `--${name}`).toBe(false);
  }
});

it("@theme maps each palette and supporting name to a --color-* name", () => {
  const theme = themeTokens(css);
  for (const name of themeColorNames) {
    expect(theme.get(`color-${name}`), `--color-${name}`).toBe(`var(--${name})`);
  }
});

it("@theme does not map the Studio state variables", () => {
  const theme = themeTokens(css);
  for (const name of Object.keys(designTokens).filter((key) => /^(ok|work|warn|bad|none)(-|$)/.test(key))) {
    expect(theme.has(`color-${name}`), `--color-${name}`).toBe(false);
  }
});

it("the CSS names neither Kiwi Maru nor Nunito", () => {
  expect(css).not.toContain("Kiwi Maru");
  expect(css).not.toContain("Nunito");
});

it("main.tsx imports the four Baloo 2 weights and no old font", () => {
  for (const weight of [500, 600, 700, 800]) {
    expect(main).toContain(`@fontsource/baloo-2/${weight}.css`);
  }
  expect(main).not.toContain("kiwi-maru");
  expect(main).not.toContain("nunito");
});

it("no stock shadcn values and no dark block", () => {
  expect(css).not.toContain("oklch(");
  expect(css).not.toMatch(/^\s*\.dark/m);
  expect(css).not.toContain("prefers-color-scheme");
});
