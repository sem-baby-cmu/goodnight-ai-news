import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { renderInRouter } from "./fixtures";
import { StudioHeader } from "./StudioHeader";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

it("StudioHeader shows Studio and one link Stories to /studio, with no fill on the current link", async () => {
  // At /studio the link is the current one: the state that board 12 fills
  // with --ok. DESIGN.md 4 wins: a Ghost button has no fill (UI constraints).
  renderInRouter(<StudioHeader />, "/studio", "/studio");
  const label = await screen.findByText("Stories");
  const link = label.closest("a");
  expect(link).not.toBeNull();
  expect(link?.getAttribute("href")).toBe("/studio");
  expect(screen.getByText("Studio")).toBeTruthy();

  // One nav link only: no "Open the Player" (D23-19).
  expect(document.querySelectorAll("a")).toHaveLength(1);
  expect(screen.queryByText("Open the Player")).toBeNull();

  // No class of the link or of an element in it names a state fill, and no
  // variant of the current state sets a background.
  const elements = [link as HTMLElement, ...Array.from(link?.querySelectorAll<HTMLElement>("*") ?? [])];
  for (const el of elements) {
    const classes = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean);
    expect(classes.filter((c) => c.includes("var(--ok"))).toEqual([]);
    expect(classes.filter((c) => /^(aria-current|aria-\[current|data-\[status=active\]|data-status|data-active|data-current)[^:]*:.*bg-/.test(c))).toEqual([]);
    expect(el.style.background).toBe("");
    expect(el.style.backgroundColor).toBe("");
  }
});
