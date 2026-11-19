import type { PaletteId } from "@storybook/dsl";

// DESIGN.md palette values, proposed; the owner judges them in #15.
export const SKY_COLORS = {
  day: "#7EBDE6",
  cloudy: "#E3ECF6",
  dusk: "#F3ECDD",
  night: "#1B2440",
} as const satisfies Record<PaletteId, string>;
