import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, expect, it } from "vitest";
import { AlertIcon, ArcIcon, CheckIcon, ClockIcon, CrossIcon, DashIcon } from "./icons";
import { StateChip } from "./StateChip";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

type State = "ok" | "work" | "warn-stale" | "warn-review" | "bad" | "none";

// Exact changes 8: the state variable prefix and the icon of each state.
const states: Array<{ state: State; prefix: string; Icon: ComponentType }> = [
  { state: "ok", prefix: "ok", Icon: CheckIcon },
  { state: "work", prefix: "work", Icon: ArcIcon },
  { state: "warn-stale", prefix: "warn", Icon: ClockIcon },
  { state: "warn-review", prefix: "warn", Icon: AlertIcon },
  { state: "bad", prefix: "bad", Icon: CrossIcon },
  { state: "none", prefix: "none", Icon: DashIcon },
];

function iconMarkup(Icon: ComponentType): string {
  const { container } = render(<Icon />);
  const svg = container.querySelector("svg");
  const markup = svg?.innerHTML ?? "";
  cleanup();
  return markup;
}

it("StateChip renders a word and an icon for every state", () => {
  const drawn = new Set<string>();
  for (const { state, prefix, Icon } of states) {
    const expected = iconMarkup(Icon);
    expect(expected).not.toBe("");
    drawn.add(expected);

    render(<StateChip state={state} label={`Label ${state}`} />);
    const word = screen.getByText(`Label ${state}`);
    // The chip is the element with the fill: the word or one of its parents.
    const chip = word.closest(`[class*="bg-[var(--${prefix})]"]`);
    expect(chip, state).not.toBeNull();
    const classes = (chip?.className ?? "").split(/\s+/);
    expect(classes, state).toContain(`bg-[var(--${prefix})]`);
    expect(classes, state).toContain(`text-[var(--${prefix}-chip)]`);

    const icons = chip?.querySelectorAll("svg") ?? [];
    expect(icons, state).toHaveLength(1);
    expect(icons[0].getAttribute("aria-hidden"), state).toBe("true");
    expect(icons[0].innerHTML, state).toBe(expected);
    cleanup();
  }
  // Six states, six different icons.
  expect(drawn.size).toBe(6);
});
