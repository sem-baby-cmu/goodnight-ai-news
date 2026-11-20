import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isDisabled, renderInRouter, routes, searchOf, squash, stubFetch, uuid, words } from "./fixtures";
import { NewStoryForm } from "./NewStoryForm";

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
});

const storyId = uuid(41);
const runId = uuid(42);

function renderForm() {
  return renderInRouter(<NewStoryForm />, "/studio", "/studio");
}

const makeStory = () => screen.getByRole("button", { name: "Make story" });

it("NewStoryForm posts {text} and navigates to /studio/stories/<storyId>?runId=<runId>", async () => {
  const { calls } = stubFetch(
    routes({ "POST /api/studio/stories": { status: 202, body: { storyId, runId, words: 200, truncated: false } } }),
  );
  const { router } = renderForm();
  const text = words(200);
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: text } });
  fireEvent.click(makeStory());

  await waitFor(() => expect(router.state.location.pathname).toBe(`/studio/stories/${storyId}`));
  expect(searchOf(router).runId).toBe(runId);
  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("POST");
  expect(calls[0].path).toBe("/api/studio/stories");
  expect(calls[0].body).toEqual({ text });
  expect(calls[0].headers.get("content-type")).toContain("application/json");
});

it("NewStoryForm disables Make story under 200 words", async () => {
  const { calls } = stubFetch(() => ({ status: 500, body: null }));
  renderForm();
  const field = await screen.findByRole("textbox");

  fireEvent.change(field, { target: { value: words(199) } });
  expect(isDisabled(makeStory())).toBe(true);
  fireEvent.click(makeStory());
  expect(calls).toHaveLength(0);

  // White space does not count as words (the rule of `limitWords`).
  fireEvent.change(field, { target: { value: `  ${words(199)} \n\n ` } });
  expect(isDisabled(makeStory())).toBe(true);

  fireEvent.change(field, { target: { value: words(200) } });
  expect(isDisabled(makeStory())).toBe(false);
});

it("NewStoryForm disables Make story for a URL that is not http or https", async () => {
  stubFetch(() => ({ status: 500, body: null }));
  renderForm();
  fireEvent.click(await screen.findByRole("button", { name: "Article URL" }));
  const field = screen.getByRole("textbox");

  for (const value of ["", "not a url", "ftp://example.com/news", "javascript:alert(1)"]) {
    fireEvent.change(field, { target: { value } });
    expect(isDisabled(makeStory()), value).toBe(true);
  }
  fireEvent.change(field, { target: { value: "https://example.com/news" } });
  expect(isDisabled(makeStory())).toBe(false);
  fireEvent.change(field, { target: { value: "http://example.com/news" } });
  expect(isDisabled(makeStory())).toBe(false);
});

it('RUN-02.S8 NewStoryForm on URL 422 switches to Paste text and shows a role=alert notice with "No run was started."', async () => {
  const url = "https://example.com/news/fox";
  const { calls } = stubFetch(
    routes({ "POST /api/studio/stories": { status: 422, body: { error: "source_rejected", reason: "fetch_failed" } } }),
  );
  const { router } = renderForm();
  fireEvent.click(await screen.findByRole("button", { name: "Article URL" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: url } });
  fireEvent.click(makeStory());

  const alert = await screen.findByRole("alert");
  expect(squash(alert.textContent)).toContain(squash("Could not read enough text from that page."));
  expect(squash(alert.textContent)).toContain(squash("No run was started. Paste the text instead."));
  expect(calls[0].body).toEqual({ url });

  // The form is in "Paste text" mode now, and no navigation happened.
  expect(screen.getByRole("button", { name: "Paste text" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Article URL" }).getAttribute("aria-pressed")).toBe("false");
  expect(router.state.location.pathname).toBe("/studio");

  // The URL is kept.
  fireEvent.click(screen.getByRole("button", { name: "Article URL" }));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(url);
});

it("NewStoryForm on text 422 shows the short-text notice", async () => {
  stubFetch(
    routes({
      "POST /api/studio/stories": { status: 422, body: { error: "source_rejected", reason: "text_too_short", words: 150 } },
    }),
  );
  renderForm();
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: words(200) } });
  fireEvent.click(makeStory());

  const alert = await screen.findByRole("alert");
  expect(squash(alert.textContent)).toContain(squash("The text has fewer than 200 words."));
  expect(squash(alert.textContent)).toContain(squash("No run was started."));
});

it("NewStoryForm on 503 workflow_unavailable navigates to the story", async () => {
  stubFetch(
    routes({ "POST /api/studio/stories": { status: 503, body: { error: "workflow_unavailable", storyId, runId } } }),
  );
  const { router } = renderForm();
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: words(250) } });
  fireEvent.click(makeStory());

  await waitFor(() => expect(router.state.location.pathname).toBe(`/studio/stories/${storyId}`));
  expect(searchOf(router).runId).toBeUndefined();
});

it("NewStoryForm on another status shows Request failed (<status>)", async () => {
  stubFetch(routes({ "POST /api/studio/stories": { status: 500, body: { error: "internal" } } }));
  const { router } = renderForm();
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: words(250) } });
  fireEvent.click(makeStory());

  const alert = await screen.findByRole("alert");
  expect(squash(alert.textContent)).toContain(squash("Request failed (500). No run was started."));
  expect(router.state.location.pathname).toBe("/studio");
});
