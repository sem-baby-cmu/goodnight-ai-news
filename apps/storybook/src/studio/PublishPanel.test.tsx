import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  isDisabled,
  pageFixture,
  releaseCreatedFixture,
  releaseFixture,
  routes,
  squash,
  STORY_ID,
  stubFetch,
} from "./fixtures";
import type { StoryDetailResponse } from "./api";
import { PublishPanel } from "./PublishPanel";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

const publishPath = `/api/studio/stories/${STORY_ID}/releases`;
const readyPages = () => [pageFixture(1), pageFixture(2), pageFixture(3)];

type PanelProps = { pages?: StoryDetailResponse["pages"]; releases?: StoryDetailResponse["releases"] };

function renderPanel(props: PanelProps = {}) {
  const onPublished = vi.fn<() => void>();
  render(<PublishPanel storyId={STORY_ID} pages={readyPages()} releases={[]} onPublished={onPublished} {...props} />);
  return { onPublished };
}

const publishButton = () => screen.getByRole("button", { name: /^Publish release \d+$/ });
// DESIGN.md 13.2 does not name the label of the disabled button of the Blocked form.
const blockedButton = () => screen.getByRole("button", { name: /^Publish/ });

it('PUB-02.S8 PublishPanel is disabled with "page 3: stale scene" when page 3 scene is stale', () => {
  const { calls } = stubFetch(() => ({ status: 201, body: releaseCreatedFixture(1) }));
  const pages = [
    pageFixture(1),
    pageFixture(2),
    pageFixture(3, { state: "stale", problems: [{ target: "scene", reason: "stale" }] }),
  ];
  renderPanel({ pages });

  expect(screen.getByText("page 3: stale scene")).toBeTruthy();
  expect(screen.queryByText("All pages are ready.")).toBeNull();
  expect(isDisabled(blockedButton())).toBe(true);
  fireEvent.click(blockedButton());
  expect(calls).toHaveLength(0);
});

it("PublishPanel names the text target text and shows missing outline for no pages", () => {
  stubFetch(() => ({ status: 500, body: null }));
  renderPanel({
    pages: [
      pageFixture(1, {
        state: "missing",
        problems: [
          { target: "page_text", reason: "missing" },
          { target: "audio", reason: "missing" },
        ],
      }),
    ],
  });
  expect(screen.getByText("page 1: missing text")).toBeTruthy();
  expect(screen.getByText("page 1: missing audio")).toBeTruthy();
  cleanup();

  renderPanel({ pages: [] });
  expect(screen.getByText("missing outline")).toBeTruthy();
  expect(isDisabled(blockedButton())).toBe(true);
});

it("PUB-02.S9 PublishPanel on 409 shows the server list, not the client list", async () => {
  stubFetch(
    routes({
      [`POST ${publishPath}`]: {
        status: 409,
        body: {
          error: "publish_blocked",
          blocking: [
            { pageId: null, page: 2, target: "audio", reason: "missing", message: "page 2: missing audio" },
            { pageId: null, page: 3, target: "scene", reason: "stale", message: "page 3: stale scene" },
          ],
        },
      },
    }),
  );
  const { onPublished } = renderPanel();
  // The client finds no blocking page.
  expect(screen.getByText("All pages are ready.")).toBeTruthy();
  fireEvent.click(publishButton());

  expect(await screen.findByText("page 2: missing audio")).toBeTruthy();
  expect(screen.getByText("page 3: stale scene")).toBeTruthy();
  expect(screen.queryByText("All pages are ready.")).toBeNull();
  expect(onPublished).not.toHaveBeenCalled();
});

it("PublishPanel shows Publish release 3 when releases 1 and 2 exist", () => {
  stubFetch(() => ({ status: 500, body: null }));
  renderPanel({ releases: [releaseFixture(1), releaseFixture(2)] });
  expect(screen.getByText("All pages are ready.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Publish release 3" })).toBeTruthy();
  expect(isDisabled(publishButton())).toBe(false);
  cleanup();

  renderPanel({ releases: [] });
  expect(screen.getByRole("button", { name: "Publish release 1" })).toBeTruthy();
});

it("PublishPanel on success shows Release <n> published. and a link to playerUrl", async () => {
  const created = releaseCreatedFixture(3);
  const { calls } = stubFetch(routes({ [`POST ${publishPath}`]: { status: 201, body: created } }));
  const { onPublished } = renderPanel({ releases: [releaseFixture(1), releaseFixture(2)] });
  fireEvent.click(publishButton());

  // An "ok" notice is a status, not an alert (DESIGN.md 14).
  const notices = await screen.findAllByRole("status");
  expect(notices.some((a) => squash(a.textContent).includes(squash("Release 3 published.")))).toBe(true);
  const open = screen.getByText("Open release 3 in the Player").closest("a");
  expect(open?.getAttribute("href")).toBe(created.playerUrl);
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST ${publishPath}`]);
  await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Published without the paper texture", { exact: false })).toBeNull();
});

it('PublishPanel on success with texture null shows "Published without the paper texture"', async () => {
  stubFetch(routes({ [`POST ${publishPath}`]: { status: 201, body: { ...releaseCreatedFixture(1), texture: null } } }));
  renderPanel();
  fireEvent.click(publishButton());

  await waitFor(() =>
    expect(
      screen.getAllByRole("status").some((a) => squash(a.textContent).includes(squash("Published without the paper texture"))),
    ).toBe(true),
  );
});

it("PublishPanel on publish_conflict shows the conflict notice and calls onPublished", async () => {
  stubFetch(routes({ [`POST ${publishPath}`]: { status: 409, body: { error: "publish_conflict" } } }));
  const { onPublished } = renderPanel();
  fireEvent.click(publishButton());

  await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
  const alerts = screen.getAllByRole("alert");
  expect(
    alerts.some((a) =>
      squash(a.textContent).includes(squash("Another publish ran at the same time. Nothing was published. Try again.")),
    ),
  ).toBe(true);
});

it("PublishPanel with no answer calls onPublished, says it is not known if the release was published, and never prints (0)", async () => {
  stubFetch(
    routes({
      [`POST ${publishPath}`]: () => {
        throw new TypeError("Failed to fetch");
      },
    }),
  );
  const { onPublished } = renderPanel();
  fireEvent.click(publishButton());

  await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
  const alerts = screen.getAllByRole("alert");
  const notice = alerts.find((a) => squash(a.textContent).includes(squash("No answer came from the server.")));
  expect(notice).toBeDefined();
  expect(squash(notice?.textContent)).toContain(
    squash("It is not known if the release was published. Check the Releases card before you try again."),
  );
  expect(document.body.textContent).not.toContain("(0)");
});

it("PublishPanel on another status shows Publishing failed (<status>). and Nothing was published. Try again.", async () => {
  stubFetch(routes({ [`POST ${publishPath}`]: { status: 500, body: { error: "internal" } } }));
  const { onPublished } = renderPanel();
  fireEvent.click(publishButton());

  const alerts = await screen.findAllByRole("alert");
  expect(alerts.some((a) => squash(a.textContent).includes(squash("Publishing failed (500). Nothing was published. Try again.")))).toBe(true);
  expect(onPublished).not.toHaveBeenCalled();
});
