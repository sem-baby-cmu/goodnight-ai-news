import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { releaseFixture, renderInRouter, squash, storyDetailFixture } from "./fixtures";
import { ReleasesCard } from "./ReleasesCard";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);

const OFF_NOTICE = "This book is off the shelf. Publish a new release to put it back.";

function renderCard(story: ReturnType<typeof storyDetailFixture>["story"], releases: ReturnType<typeof releaseFixture>[]) {
  return renderInRouter(<ReleasesCard story={story} releases={releases} />, "/studio/stories/$storyId", `/studio/stories/${story.id}`);
}

// The href of the link around each "Open" label, in document order.
function openHrefs(): Array<string | null> {
  return screen.queryAllByText("Open").map((el) => el.closest("a")?.getAttribute("href") ?? null);
}

// Index of `text` in the text of the card, to check the order of rows and chips.
function at(container: HTMLElement, text: string): number {
  const i = squash(container.textContent).indexOf(squash(text));
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
}

it("ReleasesCard marks the published release On the shelf with Open, and an earlier release with Open and no chip", async () => {
  const r1 = releaseFixture(1);
  const r2 = releaseFixture(2);
  const base = storyDetailFixture().story;
  const story = { ...base, status: "published" as const, publishedReleaseId: r2.id, onShelf: true };
  const { container } = renderCard(story, [r1, r2]);

  expect(await screen.findByText("Release 2")).toBeTruthy();
  // Newest first; the chip is on the row of release 2.
  expect(at(container, "Release 2")).toBeLessThan(at(container, "On the shelf"));
  expect(at(container, "On the shelf")).toBeLessThan(at(container, "Release 1"));
  expect(screen.getAllByText("On the shelf")).toHaveLength(1);
  expect(screen.queryByText("Off the shelf")).toBeNull();
  expect(openHrefs()).toEqual([`/read/${r2.id}`, `/read/${r1.id}`]);
  expect(squash(container.textContent)).not.toContain(squash(OFF_NOTICE));
});

it("ReleasesCard shows Off the shelf and no button on every withdrawn release, and the off-the-shelf notice", async () => {
  const r1 = releaseFixture(1, { withdrawn: true });
  const r2 = releaseFixture(2, { withdrawn: true });
  const base = storyDetailFixture().story;
  const story = { ...base, status: "published" as const, publishedReleaseId: r2.id, onShelf: false };
  const { container } = renderCard(story, [r1, r2]);

  expect(await screen.findByText("Release 2")).toBeTruthy();
  expect(screen.getAllByText("Off the shelf")).toHaveLength(2);
  expect(screen.queryByText("On the shelf")).toBeNull();
  expect(openHrefs()).toEqual([]);
  expect(container.querySelectorAll("button, a, [role=button]")).toHaveLength(0);
  // A "working" notice is a status, not an alert (DESIGN.md 14).
  const notices = screen.getAllByRole("status");
  expect(notices.some((a) => squash(a.textContent).includes(squash(OFF_NOTICE)))).toBe(true);
  expect(screen.queryAllByRole("alert")).toHaveLength(0);
});

it("ReleasesCard shows None without releases", async () => {
  const story = storyDetailFixture().story;
  const { container } = renderCard(story, []);
  const none = await screen.findByText("None");
  expect(none.closest(".text-ink-3")).not.toBeNull();
  expect(container.querySelectorAll("a")).toHaveLength(0);
});
