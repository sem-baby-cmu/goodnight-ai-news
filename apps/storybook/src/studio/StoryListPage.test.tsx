import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderInRouter, routes, squash, storyListFixture, storyListItem, stubFetch, uuid } from "./fixtures";
import { StoryListPage } from "./StoryListPage";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderList(stories: ReturnType<typeof storyListItem>[]) {
  stubFetch(routes({ "GET /api/studio/stories": { status: 200, body: storyListFixture(stories) } }));
  return renderInRouter(<StoryListPage />, "/studio", "/studio");
}

// The table row that holds `text`.
async function rowOf(text: string): Promise<HTMLElement> {
  const row = (await screen.findByText(text)).closest("tr");
  expect(row, text).not.toBeNull();
  return row as HTMLElement;
}

it("EDT-01.S4 StoryListPage lists the stories in API order with Title, Release and Created", async () => {
  const titled = storyListItem(1, { title: "The fox and the river" });
  const untitled = storyListItem(2, { title: null });
  renderList([titled, untitled]);

  expect(await screen.findByRole("columnheader", { name: "Title" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Release" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Created" })).toBeTruthy();
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);

  const first = await rowOf("The fox and the river");
  const second = await rowOf("Untitled");
  // API order: the titled story first.
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(first).getByText("The fox and the river").closest("a")?.getAttribute("href")).toBe(
    `/studio/stories/${titled.id}`,
  );
  expect(within(second).getByText("Untitled").closest("a")?.getAttribute("href")).toBe(`/studio/stories/${untitled.id}`);
});

it("EDT-05.S5 StoryListPage shows Off the shelf on the row of the story that is off the shelf only", async () => {
  const off = storyListItem(1, {
    title: "Taken off",
    status: "published",
    publishedReleaseId: uuid(601),
    publishedReleaseNumber: 2,
    onShelf: false,
  });
  const on = storyListItem(2, {
    title: "On the shelf story",
    status: "published",
    publishedReleaseId: uuid(602),
    publishedReleaseNumber: 1,
    onShelf: true,
  });
  renderList([off, on]);

  const offRow = await rowOf("Taken off");
  const onRow = await rowOf("On the shelf story");
  expect(within(offRow).getByText("Release 2")).toBeTruthy();
  expect(within(offRow).getAllByText("Off the shelf")).toHaveLength(1);
  expect(within(onRow).getByText("Release 1")).toBeTruthy();
  expect(within(onRow).queryByText("Off the shelf")).toBeNull();
  expect(screen.getAllByText("Off the shelf")).toHaveLength(1);
});

it('EDT-05.S7 StoryListPage shows "None" and no Off the shelf chip for a draft with no release', async () => {
  const draft = storyListItem(1, { title: "A draft", publishedReleaseId: null, publishedReleaseNumber: null, onShelf: false });
  renderList([draft]);

  const row = await rowOf("A draft");
  const none = within(row).getByText("None");
  // Soft ink: the word or the element around it in the row.
  const soft = none.closest(".text-ink-3");
  expect(soft).not.toBeNull();
  expect(row.contains(soft)).toBe(true);
  expect(within(row).queryByText("Off the shelf")).toBeNull();
  expect(within(row).queryByText(/^Release/)).toBeNull();
});

it("StoryListPage shows Could not load the stories (<status>) on an error", async () => {
  stubFetch(routes({ "GET /api/studio/stories": { status: 500, body: { error: "internal" } } }));
  renderInRouter(<StoryListPage />, "/studio", "/studio");

  const alerts = await screen.findAllByRole("alert");
  expect(alerts.some((a) => squash(a.textContent).includes(squash("Could not load the stories (500).")))).toBe(true);
});

it("StoryListPage with no answer says so and never prints (0)", async () => {
  stubFetch(
    routes({
      "GET /api/studio/stories": () => {
        throw new TypeError("Failed to fetch");
      },
    }),
  );
  renderInRouter(<StoryListPage />, "/studio", "/studio");

  const alerts = await screen.findAllByRole("alert");
  const notice = alerts.find((a) => squash(a.textContent).includes(squash("No answer came from the server.")));
  expect(squash(notice?.textContent)).toContain(squash("Reload to try again."));
  expect(document.body.textContent).not.toContain("(0)");
});

it("StoryListPage gives the Loading line role status", async () => {
  stubFetch(routes({ "GET /api/studio/stories": () => new Promise(() => {}) }));
  renderInRouter(<StoryListPage />, "/studio", "/studio");
  expect((await screen.findByText("Loading the stories.")).getAttribute("role")).toBe("status");
});
