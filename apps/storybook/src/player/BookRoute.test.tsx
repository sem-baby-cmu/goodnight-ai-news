import type { AssetsSettledReport, SceneViewProps } from "@storybook/scene-runtime";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { SILENT_WAV } from "./audio";
import {
  animations,
  deferred,
  FIXTURE_FILES,
  FIXTURE_ID,
  FIXTURE_PAGES,
  FIXTURE_ROOT,
  fixtureFetch,
  installBrowserStubs,
  PAGE_IDS,
  pauses,
  plays,
  renderBook,
} from "./testStubs";

// SceneView becomes a stub that keeps its last props, so a test sends the
// load report and the sound-effect callback itself. The real runtime is
// covered by the browser tests (e2e/player.spec.ts).
const scene = vi.hoisted(() => ({ last: null as SceneViewProps | null }));
vi.mock("@storybook/scene-runtime", async (importOriginal) => {
  const real = await importOriginal<typeof import("@storybook/scene-runtime")>();
  function SceneView(props: SceneViewProps) {
    scene.last = props;
    return <div data-testid="scene" data-phase={props.phase} data-page={props.page.layers[0]?.instanceId} />;
  }
  return { ...real, SceneView };
});

let restore: () => void;
beforeAll(() => {
  restore = installBrowserStubs();
});
afterAll(() => restore());
beforeEach(() => {
  scene.last = null;
  plays.length = 0;
  pauses.length = 0;
  animations.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const start = () => screen.getByRole("button", { name: "Start the story" });
const button = (name: string) => screen.getByRole("button", { name });
// The narration of the sheet that is not inert (the arriving one in a turn).
const currentNarration = () => screen.getAllByTestId("narration").find((el) => !el.closest("[inert]"))!;
const narrationUrl = (i: number) => new URL(FIXTURE_ROOT + FIXTURE_PAGES[i]!.audio, document.baseURI).href;
const sceneOf = (sheet: HTMLElement) => within(sheet).getByTestId("scene");
// Ends every animation that runs, and lets the `finished` callbacks run.
const finishAll = () =>
  act(async () => {
    animations.forEach((a) => a.finish());
  });
const settle = (report: AssetsSettledReport = { failed: [] }) =>
  act(() => {
    scene.last!.onAssetsSettled!(report);
  });

// Renders the fixture book and waits until the page 1 SceneView is mounted.
async function openBook(textureUrl: string | null = null) {
  const net = fixtureFetch();
  vi.stubGlobal("fetch", net.fetchImpl);
  renderBook(FIXTURE_ID, { textureUrl });
  await screen.findByTestId("scene");
  return net;
}

async function ready(textureUrl: string | null = null) {
  const net = await openBook(textureUrl);
  await settle();
  await waitFor(() => expect(start().getAttribute("aria-disabled")).not.toBe("true"));
  return net;
}

it("PLY-04.S10 Start waits for the page data", async () => {
  const pageJson = deferred<void>();
  const texture = deferred<void>();
  const decode = vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(() => texture.promise);
  // Page 2 JSON answers with the fixture file once it is released.
  const net = fixtureFetch();
  const held = ((input: RequestInfo | URL, init?: RequestInit) =>
    String(input).endsWith(`pages/${PAGE_IDS[1]}.json`)
      ? pageJson.promise.then(() => net.fetchImpl(input, init))
      : net.fetchImpl(input, init)) as typeof fetch;
  vi.stubGlobal("fetch", held);
  renderBook(FIXTURE_ID, { textureUrl: "/paper-texture.webp" });

  // A pending page JSON.
  expect((await screen.findByRole("button", { name: "Start the story" })).getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByText("Opening the book")).toBeTruthy();
  expect(screen.queryByTestId("scene")).toBeNull();

  // A pending report.
  await act(async () => pageJson.resolve());
  await screen.findByTestId("scene");
  expect(start().getAttribute("aria-disabled")).toBe("true");
  expect(scene.last!.phase).toBe("incoming");

  // A pending texture.
  await settle();
  expect(start().getAttribute("aria-disabled")).toBe("true");

  await act(async () => texture.resolve());
  await waitFor(() => expect(start().getAttribute("aria-disabled")).not.toBe("true"));
  expect(decode).toHaveBeenCalled();
  expect(scene.last!.textureUrl).toBe("/paper-texture.webp");
  decode.mockRestore();
});

it("PLY-04.S14 Start does not wait for audio", async () => {
  const net = await ready();
  const urls = net.calls.map((c) => c.url).sort();
  expect(urls).toEqual([`${FIXTURE_ROOT}manifest.json`, ...PAGE_IDS.map((id) => `${FIXTURE_ROOT}pages/${id}.json`)].sort());
  expect(plays).toHaveLength(0);
});

it("PLY-02.S7 Start plays a silent clip on the sound-effect element", async () => {
  const net = await ready();
  fireEvent.click(start());
  expect(plays.map((p) => [p.id, p.src])).toEqual([
    ["narration-audio", new URL(FIXTURE_ROOT + FIXTURE_PAGES[0]!.audio, document.baseURI).href],
    ["sfx-audio", SILENT_WAV],
  ]);
  expect(net.calls.some((c) => c.url.startsWith("data:"))).toBe(false);
  // Page 1 is now current, not remounted, and the focus is on "next".
  expect(scene.last!.phase).toBe("current");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next page" }));
});

it("a report or a texture failure after Ready changes nothing", async () => {
  await ready();
  await settle({ failed: [{ key: "backdrop", ref: "meadow", url: null, reason: "late" }] });
  expect(start().getAttribute("aria-disabled")).not.toBe("true");
  expect(screen.queryByText("This book is sleeping. Come back soon.")).toBeNull();
});

it("exactly two audio elements exist in every state", async () => {
  const audios = () => [...document.querySelectorAll("audio")];
  const net = fixtureFetch((path) => (path === "manifest.json" ? new Promise<Response>(() => {}) : undefined));
  vi.stubGlobal("fetch", net.fetchImpl);
  renderBook(FIXTURE_ID);
  await screen.findByText("Opening the book");
  expect(audios()).toHaveLength(2);
  cleanup();

  await openBook();
  const first = audios();
  expect(first.map((a) => a.dataset.testid)).toEqual(["narration-audio", "sfx-audio"]);
  expect(first.every((a) => a.getAttribute("preload") === "none")).toBe(true);
  await settle();
  await waitFor(() => expect(start().getAttribute("aria-disabled")).not.toBe("true"));
  expect(audios()).toEqual(first);

  fireEvent.click(start());
  expect(currentNarration().textContent).toBe(FIXTURE_PAGES[0]!.text);
  expect(audios()).toEqual(first);
  for (let i = 1; i < PAGE_IDS.length; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(currentNarration().textContent).toBe(FIXTURE_PAGES[i]!.text);
    expect(audios()).toEqual(first);
  }
  fireEvent.click(screen.getByRole("button", { name: "The end" }));
  await finishAll();
  expect(audios()).toEqual(first);
  fireEvent.click(screen.getByRole("button", { name: "Read again" }));
  await finishAll();
  expect(audios()).toEqual(first);
  cleanup();

  vi.stubGlobal("fetch", fixtureFetch((path) => (path === "manifest.json" ? new Response("", { status: 404 }) : undefined)).fetchImpl);
  renderBook(FIXTURE_ID);
  await screen.findByText("This book is sleeping. Come back soon.");
  expect(audios()).toHaveLength(2);
});

it("next and previous play the narration of the new page in the click", async () => {
  await ready();
  fireEvent.click(start());
  const narration = (i: number) => new URL(FIXTURE_ROOT + FIXTURE_PAGES[i]!.audio, document.baseURI).href;
  const previous = screen.getByRole("button", { name: "Previous page" });
  expect(previous.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(previous);
  expect(plays).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(plays.at(-1)).toMatchObject({ id: "narration-audio", src: narration(1) });
  expect(screen.getByRole("status", { name: "Page 2 of 4" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
  expect(plays.at(-1)).toMatchObject({ id: "narration-audio", src: narration(0) });
  // The sfx element was never played again after Start.
  expect(plays.filter((p) => p.id === "sfx-audio")).toHaveLength(1);
});

it("a sound effect of the current page plays on the shared sfx element", async () => {
  await ready();
  fireEvent.click(start());
  act(() => scene.last!.onSfx!("ding"));
  expect(plays.at(-1)).toMatchObject({ id: "sfx-audio", src: new URL(`${FIXTURE_ROOT}assets/ding/v1/ding.wav`, document.baseURI).href });
  const count = plays.length;
  act(() => scene.last!.onSfx!("pip"));
  expect(plays).toHaveLength(count);
});

it("Home stops both audio elements and shows the shelf", async () => {
  await ready();
  fireEvent.click(start());
  fireEvent.click(screen.getByRole("button", { name: "Home" }));
  expect(pauses.map((p) => p.id)).toEqual(expect.arrayContaining(["narration-audio", "sfx-audio"]));
  expect(await screen.findByTestId("shelf-placeholder")).toBeTruthy();
  expect(document.querySelectorAll("audio")).toHaveLength(0);
});

it("a failed first page in Loading shows the Resting state", async () => {
  await openBook();
  await settle({ failed: [{ key: "backdrop", ref: "meadow", url: null, reason: "decode" }] });
  expect(await screen.findByText("This book is sleeping. Come back soon.")).toBeTruthy();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Home" }).textContent).toContain("Home");
});

// From Start to page 4 with "next", each turn finished.
async function toLastPage() {
  for (let i = 1; i < PAGE_IDS.length; i++) {
    fireEvent.click(button("Next page"));
    await finishAll();
  }
}

it("a turn keeps two sheets until it finishes, and its end plays nothing", async () => {
  await ready();
  fireEvent.click(start());
  const pauseCount = pauses.length;
  fireEvent.click(button("Next page"));
  // A turn never touches the sound-effect element.
  expect(pauses.slice(pauseCount).map((p) => p.id)).not.toContain("sfx-audio");
  const sheets = screen.getAllByTestId("page-sheet");
  expect(sheets).toHaveLength(2);
  expect(sheets[0]!.hasAttribute("inert")).toBe(true);
  expect(sceneOf(sheets[0]!).getAttribute("data-phase")).toBe("outgoing");
  expect(sheets[1]!.hasAttribute("inert")).toBe(false);
  expect(sceneOf(sheets[1]!).getAttribute("data-phase")).toBe("incoming");
  const count = plays.length;

  await finishAll();
  const after = screen.getAllByTestId("page-sheet");
  expect(after).toHaveLength(1);
  expect(sceneOf(after[0]!).getAttribute("data-phase")).toBe("current");
  expect(plays).toHaveLength(count);
});

it("a tap during a turn finishes it and starts a turn from its target", async () => {
  await ready();
  fireEvent.click(start());
  const before = animations.length;
  fireEvent.click(button("Next page"));
  const firstTurn = animations.slice(before);
  expect(firstTurn.length).toBeGreaterThan(0);

  fireEvent.click(button("Next page"));
  expect(firstTurn.map((a) => a.playState)).toEqual(firstTurn.map(() => "finished"));
  expect(screen.getByRole("status", { name: "Page 3 of 4" })).toBeTruthy();
  const sheets = screen.getAllByTestId("page-sheet");
  expect(sheets).toHaveLength(2);
  const leaving = sheets.find((s) => s.hasAttribute("inert"))!;
  const arriving = sheets.find((s) => !s.hasAttribute("inert"))!;
  expect(within(leaving).getByTestId("narration").textContent).toBe(FIXTURE_PAGES[1]!.text);
  expect(within(arriving).getByTestId("narration").textContent).toBe(FIXTURE_PAGES[2]!.text);
});

it("the end of an interrupted turn leaves the next turn running", async () => {
  await ready();
  fireEvent.click(start());
  fireEvent.click(button("Next page"));
  fireEvent.click(button("Next page"));
  // Every pending callback runs, also the one of the first turn. No
  // animation ends on its own in the fake, so the second turn still runs.
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const sheets = screen.getAllByTestId("page-sheet");
  expect(sheets).toHaveLength(2);
  expect(within(sheets.find((s) => s.hasAttribute("inert"))!).getByTestId("narration").textContent).toBe(FIXTURE_PAGES[1]!.text);

  await finishAll();
  expect(screen.getAllByTestId("page-sheet")).toHaveLength(1);
  expect(currentNarration().textContent).toBe(FIXTURE_PAGES[2]!.text);
});

it("a book of one page: next is The end, and Read again plays page 1", async () => {
  const manifest = JSON.parse(FIXTURE_FILES["manifest.json"]!) as { pages: unknown[] };
  const onePage = JSON.stringify({ ...manifest, pages: manifest.pages.slice(0, 1) });
  vi.stubGlobal(
    "fetch",
    fixtureFetch((path) => (path === "manifest.json" ? new Response(onePage, { status: 200 }) : undefined)).fetchImpl,
  );
  renderBook(FIXTURE_ID);
  await screen.findByTestId("scene");
  await settle();
  await waitFor(() => expect(start().getAttribute("aria-disabled")).not.toBe("true"));

  // DESIGN.md 14: "Start" moves the focus to "next", whose name on the last
  // page is "The end".
  fireEvent.click(start());
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(document.activeElement).toBe(button("The end"));
  expect(screen.getByRole("status", { name: "Page 1 of 1" })).toBeTruthy();
  expect(button("Previous page").getAttribute("aria-disabled")).toBe("true");

  // "Next" on the last page: the end page, the focus on "Read again".
  fireEvent.click(button("The end"));
  await finishAll();
  expect(document.activeElement).toBe(button("Read again"));
  expect(screen.queryByRole("status")).toBeNull();

  // "Read again": page 1 plays in the tap, the focus on "next" of page 1.
  fireEvent.click(button("Read again"));
  expect(plays.at(-1)).toMatchObject({ id: "narration-audio", src: narrationUrl(0) });
  expect(document.activeElement).toBe(button("The end"));
  expect(screen.queryByRole("button", { name: "Start the story" })).toBeNull();
  await finishAll();
  expect(currentNarration().textContent).toBe(FIXTURE_PAGES[0]!.text);
});

it("next on the last page shows the end page and moves the focus to Read again", async () => {
  await ready();
  fireEvent.click(start());
  await toLastPage();
  const playCount = plays.length;
  const pauseCount = pauses.length;

  fireEvent.click(button("The end"));
  expect(pauses.slice(pauseCount).map((p) => p.id)).toContain("narration-audio");
  expect(plays).toHaveLength(playCount);
  expect(document.activeElement).toBe(button("Read again"));
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(screen.queryByRole("button", { name: "The end" })).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("Read again plays page 1 in the click and moves the focus to next", async () => {
  await ready();
  fireEvent.click(start());
  await toLastPage();
  fireEvent.click(button("The end"));
  await finishAll();
  // The end page sheet, before the tap.
  const endSheets = screen.getAllByTestId("page-sheet");
  expect(endSheets).toHaveLength(1);
  const endSheet = endSheets[0]!;

  fireEvent.click(button("Read again"));
  expect(plays.at(-1)).toMatchObject({ id: "narration-audio", src: narrationUrl(0) });
  const arriving = screen.getAllByTestId("page-sheet").find((s) => !s.hasAttribute("inert"))!;
  // The first layer of page 1 (pip).
  expect(sceneOf(arriving).getAttribute("data-page")).toBe("01936b2a-0000-7000-8000-000000000021");
  // Page 1 is a new sheet; the end page sheet leaves (inert).
  expect(arriving).not.toBe(endSheet);
  expect(endSheet.isConnected).toBe(true);
  expect(endSheet.hasAttribute("inert")).toBe(true);
  expect(document.activeElement).toBe(button("Next page"));
  expect(button("Previous page").getAttribute("aria-disabled")).toBe("true");
  expect(screen.queryByRole("button", { name: "Start the story" })).toBeNull();
});

it("a tap on previous with the focus in the leaving sheet gives the focus to previous", async () => {
  await ready();
  fireEvent.click(start());
  await toLastPage();
  fireEvent.click(button("The end"));
  await finishAll();
  expect(document.activeElement).toBe(button("Read again"));

  // A pointer tap in Safari does not focus the button.
  fireEvent.click(button("Previous page"));
  const previous = button("Previous page");
  expect(document.activeElement).toBe(previous);
  expect(previous.closest("[inert]")).toBeNull();
});

it("a tap on next with the focus on the document gives the focus to next", async () => {
  await ready();
  fireEvent.click(start());
  await finishAll();
  (document.activeElement as HTMLElement | null)?.blur();
  expect(document.activeElement).toBe(document.body);

  // A pointer tap in Safari does not focus the button.
  fireEvent.click(button("Next page"));
  await finishAll();
  const next = button("Next page");
  expect(document.activeElement).toBe(next);
  expect(next.closest("[inert]")).toBeNull();
});
