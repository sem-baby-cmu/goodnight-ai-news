import { expect, it } from "vitest";
import css from "./styles.css?raw";

// Copied from DESIGN.md section 2: "Palette" (8) and "Supporting values" (20).
// Names and values are lower case, with spaces removed.
const designTokens: Record<string, string> = {
  // Palette
  sky: "#7ebde6",
  meadow: "#86b562",
  forest: "#3f6e2e",
  paper: "#f7f1e3",
  ink: "#23354a",
  night: "#1b2440",
  lamp: "#f5c35b",
  "roof-red": "#c8553d",
  // Supporting values
  card: "#fffdf7",
  border: "#eadfc6",
  "paper-edge": "#e3d8bf",
  divider: "#efe6d2",
  text: "#2b3a4a",
  "text-2": "#44525e",
  label: "#5b6b78",
  link: "#2e4a6e",
  "forest-edge": "#2b4e20",
  highlight: "#ffe08a",
  "moss-text": "#2f5233",
  "tint-sky": "#e3ecf6",
  "tint-meadow": "#eef3e4",
  "tint-sand": "#f3ecdd",
  "tint-sky-foreground": "#2e4a6e",
  "tint-meadow-foreground": "#3f6e2e",
  "tint-sand-foreground": "#6a5636",
  "night-card": "rgba(255,253,247,.08)",
  "night-label": "#c9d3e6",
  "night-title": "#ffe7a3",
};

// Every `--<name>: <value>;` inside the `:root` block, normalised like the table.
function rootTokens(text: string): Map<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(text);
  if (!block) throw new Error("styles.css has no :root block");
  const tokens = new Map<string, string>();
  for (const match of (block[1] ?? "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set((match[1] ?? "").toLowerCase(), (match[2] ?? "").replace(/\s+/g, "").toLowerCase());
  }
  return tokens;
}

it("every DESIGN.md token has its value in :root", () => {
  expect(Object.keys(designTokens)).toHaveLength(28);
  const tokens = rootTokens(css);
  for (const [name, value] of Object.entries(designTokens)) {
    expect(tokens.get(name), `--${name}`).toBe(value);
  }
});

it("no stock shadcn values and no dark block", () => {
  expect(css).not.toContain("oklch(");
  expect(css).not.toMatch(/^\s*\.dark/m);
  expect(css).not.toContain("prefers-color-scheme");
});
